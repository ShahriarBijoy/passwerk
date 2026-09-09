import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
});
