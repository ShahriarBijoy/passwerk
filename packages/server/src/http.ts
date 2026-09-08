/**
 * Streamable HTTP host on plain `node:http` (spec section 3.7). One McpServer and one session
 * store per MCP session; bearer token required on /mcp; /healthz open. Entry-point only.
 */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_INGEST_LIMITS } from '@passwerk/core';
import { nodeFileSystem } from './fs.js';
import { SERVER_NAME, SERVER_VERSION } from './meta.js';
import { createServer } from './server.js';
import type { Logger } from './types.js';
import type { UiLoader } from './ui.js';

export interface HttpOptions {
  host: string;
  port: number;
  token: string;
  root?: string;
  log: Logger;
  logPayloads?: boolean;
  /** ISO date-time source for new sessions. Default: wall clock. */
  clock?: () => string;
  /** Largest accepted request body. Default: core's maxInputBytes plus base64 overhead. */
  maxBodyBytes?: number;
  /** Workbench HTML for `ui://passwerk/workbench.html`; shared by every session. */
  ui?: UiLoader;
}

export interface HttpHandle {
  url: string;
  sessions(): number;
  close(): Promise<void>;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function jsonError(res: ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

function bearerMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function readBody(req: IncomingMessage, max: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () =>
      resolve(chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined),
    );
    req.on('error', reject);
  });
}

export async function startHttp(o: HttpOptions): Promise<HttpHandle> {
  if (!o.token) throw new Error('PASSWERK_AUTH_TOKEN is required for --http');
  const maxBody = o.maxBodyBytes ?? Math.ceil(DEFAULT_INGEST_LIMITS.maxInputBytes * 1.4);
  const sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: McpServer }
  >();
  const loopback = LOOPBACK.has(o.host);
  // Known after listen(); port 0 asks the OS for an ephemeral port.
  let boundPort = o.port;

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${o.host}`);
    if (url.pathname === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', name: SERVER_NAME, version: SERVER_VERSION }));
      return;
    }
    if (url.pathname !== '/mcp') {
      jsonError(res, 404, -32004, 'Not found');
      return;
    }
    if (!bearerMatches(req.headers.authorization, o.token)) {
      res.setHeader('www-authenticate', 'Bearer');
      jsonError(res, 401, -32001, 'Unauthorized');
      return;
    }
    let body: unknown;
    if (req.method === 'POST') {
      let raw: string | undefined;
      try {
        raw = await readBody(req, maxBody);
      } catch {
        jsonError(res, 413, -32000, 'Request body too large');
        return;
      }
      try {
        body = raw === undefined ? undefined : JSON.parse(raw);
      } catch {
        jsonError(res, 400, -32700, 'Parse error');
        return;
      }
    }
    const sid = req.headers['mcp-session-id'];
    const existing = typeof sid === 'string' ? sessions.get(sid) : undefined;
    if (existing) {
      await existing.transport.handleRequest(req, res, body);
      return;
    }
    if (sid !== undefined || !isInitializeRequest(body)) {
      jsonError(res, 404, -32001, 'Session not found');
      return;
    }
    const { server } = createServer({
      fs: nodeFileSystem(o.root),
      clock: (o.clock ?? (() => new Date().toISOString()))(),
      log: o.log,
      ...(o.logPayloads !== undefined ? { logPayloads: o.logPayloads } : {}),
      ...(o.ui ? { ui: o.ui } : {}),
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: loopback,
      ...(loopback ? { allowedHosts: [...LOOPBACK].flatMap((h) => [h, `${h}:${boundPort}`]) } : {}),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server });
        o.log('info', 'session opened', { id });
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
        o.log('info', 'session closed', { id });
      },
    });
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id && sessions.delete(id)) {
        o.log('info', 'session closed', { id });
        void server.close();
      }
    };
    // The SDK class types `onclose` as possibly undefined; the interface does not
    // (exactOptionalPropertyTypes). The cast is type-only.
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, body);
  };

  const httpServer = createHttpServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      o.log('error', 'request failed', { message: e instanceof Error ? e.message : String(e) });
      if (!res.headersSent) jsonError(res, 500, -32603, 'Internal error');
      else res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(o.port, o.host, () => resolve());
  });
  const address = httpServer.address() as AddressInfo;
  boundPort = address.port;
  const url = `http://${o.host}:${address.port}`;
  o.log('info', 'listening', { url, root: o.root ?? process.cwd() });
  return {
    url,
    sessions: () => sessions.size,
    close: async () => {
      for (const { transport, server } of sessions.values()) {
        await transport.close();
        await server.close();
      }
      sessions.clear();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
