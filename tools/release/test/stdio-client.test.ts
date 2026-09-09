import type { ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// Wraps the real spawn so tests can inspect the ChildProcess after rpcCollect settles (whether
// the OS process has actually exited by then), without changing its behaviour.
const spawnedChildren: ChildProcess[] = [];
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      const child = actual.spawn(...args);
      spawnedChildren.push(child);
      return child;
    },
  };
});

// @ts-expect-error - .mjs build helper, deliberately untyped
import { rpcCollect, StdioRpcError } from '../stdio-client.mjs';

const echo = fileURLToPath(new URL('./fixtures/echo-server.mjs', import.meta.url));

describe('rpcCollect', () => {
  it('returns one result per request, in order', async () => {
    const [a, b] = await rpcCollect({
      bin: echo,
      cwd: process.cwd(),
      requests: [{ method: 'first' }, { method: 'second', params: { x: 1 } }],
    });
    expect(a).toEqual({ echoed: 'first' });
    expect(b).toEqual({ echoed: 'second', params: { x: 1 } });
  });

  it('rejects when the server reports an error', async () => {
    await expect(
      rpcCollect({ bin: echo, cwd: process.cwd(), requests: [{ method: 'boom' }] }),
    ).rejects.toBeInstanceOf(StdioRpcError);
  });

  it('rejects on timeout without hanging', async () => {
    await expect(
      rpcCollect({
        bin: echo,
        cwd: process.cwd(),
        requests: [{ method: 'silent' }],
        timeoutMs: 300,
      }),
    ).rejects.toBeInstanceOf(StdioRpcError);
  });

  // Regression coverage for the Task 6 fix: rpcCollect used to call child.kill() and resolve
  // in the same tick, without waiting for the OS process to actually terminate (observed on
  // Windows as an EBUSY when a caller removed the child's cwd immediately afterwards). The
  // echo-server fixture never exits on its own, so the only way this can resolve at all is
  // through the real kill-then-wait path — this asserts the child is already dead (exitCode or
  // signalCode set) at the moment the promise settles, not merely "kill() was called".
  it('does not settle the happy path until the child process has actually exited', async () => {
    const before = spawnedChildren.length;
    const results = await rpcCollect({
      bin: echo,
      cwd: process.cwd(),
      requests: [{ method: 'first' }],
    });
    expect(results).toEqual([{ echoed: 'first' }]);
    const child = spawnedChildren[before];
    expect(child).toBeDefined();
    expect(child!.exitCode !== null || child!.signalCode !== null).toBe(true);
  });

  // Regression coverage for the `child.exitCode !== null || child.signalCode !== null` guard
  // in settle(): on a genuine spawn failure (verified separately: an invalid cwd makes the
  // real spawn() syscall fail) Node emits 'error' and 'close' but never 'exit'. Without the
  // guard, settle()'s fallback path would register a `child.once('exit', ...)` listener that
  // can never fire, hanging the promise forever. The tight `it(...)` timeout below (well under
  // the suite's default) turns a reintroduced hang into a visible test failure instead of a
  // stalled run.
  it('rejects promptly, not by hanging, when the child process cannot be spawned at all', async () => {
    await expect(
      rpcCollect({
        bin: echo,
        cwd: join(tmpdir(), 'passwerk-stdio-client-test-cwd-does-not-exist'),
        requests: [{ method: 'first' }],
        timeoutMs: 10000,
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  }, 3000);
});
