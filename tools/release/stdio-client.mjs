/**
 * Newline-delimited JSON-RPC over a child process's stdio, shared by the release pack smoke
 * and the MCPB bundle smoke. Frames correctly across `data` chunks (only the trailing partial
 * line stays in the buffer) and always kills the child before settling, on every path:
 * success, a malformed line, a process error or the timeout.
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
      child.kill();
      fn(arg);
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
