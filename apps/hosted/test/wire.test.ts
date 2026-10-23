import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type HostedHandle, startHosted } from '../src/http.js';
import { client, MODERN, type RpcOptions, TASKS, TOKEN } from './rpc.js';

let hosted: HostedHandle;
const { rpc, getTask, pollUntil } = client(() => hosted.url);

beforeAll(async () => {
  hosted = await startHosted({ host: '127.0.0.1', port: 0, token: TOKEN, tickMs: 20 });
});

afterAll(async () => {
  await hosted.close();
});

const callEcho = (args: Record<string, unknown>, o: RpcOptions = {}) =>
  rpc('tools/call', { name: 'slow_echo', arguments: args }, { ...o, name: 'slow_echo' });

describe('HTTP edge', () => {
  it('answers /healthz without a token', async () => {
    const res = await fetch(`${hosted.url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('refuses /mcp without a token or with a wrong one', async () => {
    expect((await rpc('server/discover', {}, { token: null })).status).toBe(401);
    expect((await rpc('server/discover', {}, { token: 'b'.repeat(64) })).status).toBe(401);
  });

  it('answers 404 for any other path', async () => {
    const res = await fetch(`${hosted.url}/admin`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(404);
  });

  it('rejects a 2025-era initialize', async () => {
    const res = await fetch(`${hosted.url}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'old', version: '1' },
        },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('refuses to start with a short token', async () => {
    await expect(startHosted({ host: '127.0.0.1', port: 0, token: 'short' })).rejects.toThrow(
      /at least 32/,
    );
  });
});

describe('tasks extension', () => {
  it('advertises the tasks extension in server/discover', async () => {
    const r = await rpc('server/discover', {});
    expect(r.body.result.supportedVersions).toEqual([MODERN]);
    expect(r.body.result.capabilities.extensions).toEqual({ [TASKS]: {} });
  });

  it('answers tools/call with a working task when the client carries the extension', async () => {
    const started = Date.now();
    const r = await callEcho({ text: 'hi', seconds: 3 });
    expect(Date.now() - started).toBeLessThan(500);
    const task = r.body.result;
    expect(task).toMatchObject({
      resultType: 'task',
      status: 'working',
      ttlMs: expect.any(Number),
      pollIntervalMs: 2000,
      content: [],
    });
    expect(task.taskId).toMatch(/^ser_[a-z2-7]{26}$/);
    expect(task.createdAt).toBe(task.lastUpdatedAt);
    expect(task).not.toHaveProperty('result');
  });

  it('reports progress, then the completed result on tasks/get', async () => {
    const { taskId } = (await callEcho({ text: 'hi', seconds: 3 })).body.result;
    const working = await pollUntil(taskId, (s) => s === 'working');
    expect(working.resultType).toBe('complete');
    expect(working.statusMessage).toMatch(/^\d of 3 s$/);
    const done = await pollUntil(taskId, (s) => s === 'completed');
    expect(done).toMatchObject({ resultType: 'complete', taskId, status: 'completed' });
    expect(done.result.content).toEqual([{ type: 'text', text: 'hi' }]);
    expect(done).not.toHaveProperty('error');
  });

  it('returns a plain result when the client lacks the extension', async () => {
    const r = await callEcho({ text: 'plain', seconds: 1 }, { tasks: false });
    expect(r.body.result.content).toEqual([{ type: 'text', text: 'plain' }]);
    expect(r.body.result.resultType).toBe('complete');
  });

  it('answers -32602 for an unknown task id', async () => {
    const r = await getTask('ser_aaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(r.body.error.code).toBe(-32602);
  });

  it('cancels a working task and keeps it cancelled', async () => {
    const { taskId } = (await callEcho({ text: 'stop me', seconds: 100 })).body.result;
    const r = await rpc('tasks/cancel', { taskId }, { name: taskId });
    expect(r.body.result).toMatchObject({ resultType: 'complete', taskId, status: 'cancelled' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await getTask(taskId)).body.result.status).toBe('cancelled');
  });

  it('rejects seconds outside 1 to 120', async () => {
    const r = await callEcho({ text: 'x', seconds: 121 });
    expect(r.body.error?.code ?? (r.body.result?.isError ? 'tool-error' : undefined)).toBeDefined();
  });
});
