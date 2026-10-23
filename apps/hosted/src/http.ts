/**
 * The HTTP edge: `GET /healthz` open, `POST /mcp` behind a bearer token, everything else 404.
 * Only revision 2026-07-28 is served; 2025-era requests are rejected by the SDK.
 */
import { timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer, type ServerDeps } from './server.js';
import { TaskRegistry } from './tasks.js';

export interface HostedOptions {
  host: string;
  port: number;
  token: string;
  /** Length of one slow_echo "second". Default 1000. */
  tickMs?: number;
  /** Folder holding one subfolder per demo series. Default `<app>/series`. */
  seriesDir?: string;
  clock?: () => Date;
  registry?: TaskRegistry;
  /** Largest accepted request body. Default 1 MiB. */
  maxBodyBytes?: number;
  log?: (line: string) => void;
}

export interface HostedHandle {
  url: string;
  close(): Promise<void>;
}

export const MIN_TOKEN_LENGTH = 32;

function bearerMatches(header: string | undefined, token: Buffer): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  return given.length === token.length && timingSafeEqual(given, token);
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

export async function startHosted(o: HostedOptions): Promise<HostedHandle> {
  if (o.token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`PASSWERK_AUTH_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  const token = Buffer.from(o.token);
  const log = o.log ?? (() => {});
  const deps: ServerDeps = {
    registry: o.registry ?? new TaskRegistry(),
    tickMs: o.tickMs ?? 1000,
    seriesDir: o.seriesDir ?? fileURLToPath(new URL('../series', import.meta.url)),
    clock: o.clock ?? (() => new Date()),
  };
  const maxRequestBodySize = o.maxBodyBytes ?? 1024 * 1024;
  const mcp = createMcpHandler(() => createServer(deps), {
    legacy: 'reject',
    maxRequestBodySize,
    onerror: (e) => log(`mcp error: ${e.message}`),
  });
  const handle = toNodeHandler(mcp, { maxRequestBodySize });

  const http = createHttpServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true });
    if (path !== '/mcp') return json(res, 404, { error: 'not found' });
    if (!bearerMatches(req.headers.authorization, token)) {
      log(`401 ${req.method} /mcp`);
      return json(
        res,
        401,
        { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null },
        { 'www-authenticate': 'Bearer' },
      );
    }
    log(`${req.method} /mcp ${String(req.headers['mcp-method'] ?? '')}`);
    // A server-side IncomingMessage always has a method and a url; the type keeps them optional.
    handle(req as Parameters<typeof handle>[0], res).catch((e: unknown) => {
      log(`handler failed: ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent) json(res, 500, { error: 'internal error' });
    });
  });

  await new Promise<void>((resolve) => http.listen(o.port, o.host, resolve));
  const { port } = http.address() as AddressInfo;
  return {
    url: `http://${o.host}:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        http.closeAllConnections();
        http.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}
