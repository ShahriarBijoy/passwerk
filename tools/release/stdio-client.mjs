/**
 * Newline-delimited JSON-RPC over a child process's stdio, shared by the release pack smoke
 * and the MCPB bundle smoke. Frames correctly across `data` chunks (only the trailing partial
 * line stays in the buffer) and, on every path (success, a malformed line, a process error or
 * the timeout), kills the child and waits for it to actually exit before settling, so a caller
 * can safely clean up the child's cwd immediately afterwards. If the child is already gone
 * (a spawn failure sets exitCode before emitting 'error', with no 'exit' event to wait for)
 * settling is immediate. Otherwise a 3 s forced SIGKILL fallback bounds the wait, so the total
 * time to settle can exceed `timeoutMs` by up to that much.
 */
import { spawn } from 'node:child_process';

export class StdioRpcError extends Error {}

export async function rpcCollect({ bin, cwd, env, requests, timeoutMs = 30000 }) {
  if (!Array.isArray(requests) || requests.length === 0)
    throw new StdioRpcError('rpcCollect needs at least one request');

  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [bin], {
      cwd,
      shell: false,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const results = new Array(requests.length).fill(undefined);
    const seen = new Set();
    let buf = '';
    let settled = false;

    const timer = setTimeout(
      () =>
        settle(
          rejectPromise,
          new StdioRpcError(
            `timed out after ${timeoutMs} ms waiting for ${requests.length - seen.size} of ${requests.length} responses`,
          ),
        ),
      timeoutMs,
    );
    timer.unref();

    function settle(fn, arg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Wait for the child to actually exit before resolving: on Windows the OS process can
      // keep its cwd (and any files under it) locked for a moment after kill() returns, which
      // races a caller's own cleanup of that same directory. A short forced-kill fallback
      // keeps this from hanging if the child ignores the signal.
      if (child.exitCode !== null || child.signalCode !== null) {
        fn(arg);
        return;
      }
      const killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // already gone
        }
      }, 3000);
      killTimer.unref();
      child.once('exit', () => {
        clearTimeout(killTimer);
        fn(arg);
      });
      child.kill();
    }

    child.stdout.on('data', (d) => {
      if (settled) return;
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch (err) {
          settle(rejectPromise, new StdioRpcError(`could not parse stdio line: ${line}\n${err}`));
          return;
        }
        if (typeof msg.id !== 'number' || msg.id < 2) continue; // initialize, or a notification
        const index = msg.id - 2;
        if (index >= requests.length || seen.has(index)) continue;
        if (msg.error) {
          settle(
            rejectPromise,
            new StdioRpcError(`${requests[index].method} error: ${JSON.stringify(msg.error)}`),
          );
          return;
        }
        results[index] = msg.result;
        seen.add(index);
        if (seen.size === requests.length) {
          settle(resolvePromise, results);
          return;
        }
      }
    });
    child.on('error', (err) => settle(rejectPromise, err));

    const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'passwerk-smoke', version: '0' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    requests.forEach((r, i) => {
      send({
        jsonrpc: '2.0',
        id: i + 2,
        method: r.method,
        ...(r.params ? { params: r.params } : {}),
      });
    });
  });
}
