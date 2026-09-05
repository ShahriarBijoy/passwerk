import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { getSample } from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type HttpHandle, startHttp } from '../src/http.ts';
import { TOOLS } from '../src/registry.ts';

const TOKEN = 't0ken-for-tests';
let handle: HttpHandle;
beforeAll(async () => {
  handle = await startHttp({
    host: '127.0.0.1',
    port: 0,
    token: TOKEN,
    log: () => {},
    clock: () => '2026-09-05T12:00:00Z',
  });
});
afterAll(() => handle.close());

async function connectClient(): Promise<{
  client: Client;
  transport: StreamableHTTPClientTransport;
}> {
  const transport = new StreamableHTTPClientTransport(new URL(`${handle.url}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: 'http-test', version: '0' });
  await client.connect(transport as Transport);
  return { client, transport };
}

describe('Streamable HTTP', () => {
  it('/healthz answers without auth', async () => {
    const r = await fetch(`${handle.url}/healthz`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: 'ok', name: 'passwerk' });
  });

  it('/mcp needs the bearer token and refuses unknown paths', async () => {
    const init = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'x', version: '0' },
      },
    };
    const none = await fetch(`${handle.url}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(init),
    });
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toBe('Bearer');
    const wrong = await fetch(`${handle.url}/mcp`, {
      method: 'POST',
      headers: { authorization: 'Bearer nope', 'content-type': 'application/json' },
      body: JSON.stringify(init),
    });
    expect(wrong.status).toBe(401);
    const other = await fetch(`${handle.url}/other`);
    expect(other.status).toBe(404);
    const noSession = await fetch(`${handle.url}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(noSession.status).toBe(404);
  });

  it('a full session lists the ten tools, and sessions have separate stores', async () => {
    const a = await connectClient();
    const b = await connectClient();
    try {
      expect(a.transport.sessionId).toBeDefined();
      expect(a.transport.sessionId).not.toBe(b.transport.sessionId);
      expect(handle.sessions()).toBe(2);
      const { tools } = await a.client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
      const v = await a.client.callTool({
        name: 'validate_passport',
        arguments: { draft: getSample('ev-valid') },
      });
      expect(v.isError).toBeFalsy();
      const capsA = (await a.client.callTool({ name: 'list_capabilities', arguments: {} }))
        .structuredContent as { server: { session: { entries: number } } };
      const capsB = (await b.client.callTool({ name: 'list_capabilities', arguments: {} }))
        .structuredContent as { server: { session: { entries: number } } };
      expect(capsA.server.session.entries).toBe(1);
      expect(capsB.server.session.entries).toBe(0);
    } finally {
      await a.transport.terminateSession();
      await a.client.close();
      await b.client.close();
    }
    expect(handle.sessions()).toBeLessThanOrEqual(1);
  });

  it('refuses to start without a token', async () => {
    await expect(
      startHttp({ host: '127.0.0.1', port: 0, token: '', log: () => {} }),
    ).rejects.toThrow(/PASSWERK_AUTH_TOKEN/);
  });
});
