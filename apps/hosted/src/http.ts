/**
 * The HTTP edge: `GET /healthz` open, `POST /mcp` behind a bearer token, `PUT /upload/<id>/<name>`
 * behind the upload id it names, everything else 404.
 * Only revision 2026-07-28 is served; 2025-era requests are rejected by the SDK.
 */
import { timingSafeEqual } from 'node:crypto';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer, type ServerDeps } from './server.js';
import { TaskRegistry } from './tasks.js';
import { type PutRefusal, UploadStore, type UploadWriter } from './uploads.js';

export interface HostedOptions {
  host: string;
  port: number;
  token: string;
  /** Length of one slow_echo "second". Default 1000. */
  tickMs?: number;
  /** Folder holding one subfolder per demo series. Default the repository's `demo/series`. */
  seriesDir?: string;
  clock?: () => Date;
  registry?: TaskRegistry;
  uploads?: UploadStore;
  /** Base of the upload URLs handed out, e.g. `https://8080-<id>.instabox.tech`. */
  publicUrl?: string;
  /** Run the AI reading step in series runs. Default false. */
  reading?: boolean;
  /** Largest accepted /mcp request body. Default 1.5 MiB, room for 1 MiB of inline base64. */
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

/** An http(s) URL without a trailing slash; anything else stops the server at start. */
export function parsePublicUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PASSWERK_PUBLIC_URL must be an absolute http or https URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('PASSWERK_PUBLIC_URL must be an absolute http or https URL');
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new Error('PASSWERK_PUBLIC_URL must not carry a query, a fragment or credentials');
  }
  return url.href.replace(/\/+$/, '');
}

const HOST = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

const firstValue = (v: string | null) => v?.split(',')[0]?.trim() ?? '';

/**
 * Where the client of this request reaches the server: the configured public URL, else the
 * proxy's `X-Forwarded-Proto` and `X-Forwarded-Host` (InstaBox rewrites `Host`), else the
 * request's own origin. Only the caller, who holds the bearer, can steer the forwarded headers.
 */
export function originFor(publicUrl: string | undefined, request: Request | undefined): string {
  if (publicUrl !== undefined) return publicUrl;
  const own = new URL(request?.url ?? 'http://localhost');
  const host = firstValue(request?.headers.get('x-forwarded-host') ?? null);
  if (!HOST.test(host)) return own.origin;
  const proto = firstValue(request?.headers.get('x-forwarded-proto') ?? null);
  const scheme = proto === 'http' || proto === 'https' ? proto : own.protocol.slice(0, -1);
  return `${scheme}://${host}`;
}

const UPLOAD_PATH = /^\/upload\/([^/]+)\/([^/]+)$/;

const PUT_STATUS: Record<PutRefusal, number> = {
  not_found: 404,
  bad_name: 400,
  slot_full: 409,
  busy: 409,
  too_large: 413,
  store_full: 503,
};

const PUT_MESSAGE: Record<Exclude<PutRefusal, 'not_found'>, string> = {
  bad_name:
    'file name: letters, digits, dot, dash, underscore and space, 1 to 100 characters, no ' +
    'leading dot, extension .pdf .xlsx .docx .csv or .txt',
  slot_full: 'this upload holds the most files it can',
  busy: 'a file of this name is being uploaded right now',
  too_large: 'file or upload too large',
  store_full: 'the server holds too many uploads; try again later',
};

const NOT_FOUND = { error: 'not found' };

/**
 * Bytes of a refused body read and dropped after the answer. Closing a socket that still has
 * unread data resets it, and the client may never see the answer; past this, it is reset.
 */
const DRAIN_LIMIT = 16 * 1024 * 1024;

function discardRest(req: IncomingMessage): void {
  let dropped = 0;
  req.on('data', (chunk: Buffer) => {
    dropped += chunk.byteLength;
    if (dropped > DRAIN_LIMIT) req.socket.destroy();
  });
  req.resume();
}

/** Reads the body into the writer chunk by chunk, stopping at the first refusal. */
function receive(
  req: IncomingMessage,
  writer: UploadWriter,
): Promise<PutRefusal | 'end' | 'aborted'> {
  return new Promise((resolve) => {
    const stop = (outcome: PutRefusal | 'end' | 'aborted') => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('close', onClose);
      resolve(outcome);
    };
    const onData = (chunk: Buffer) => {
      const refusal = writer.write(chunk);
      if (refusal !== undefined) stop(refusal);
    };
    const onEnd = () => stop('end');
    const onClose = () => stop('aborted');
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('close', onClose);
  });
}

async function putUpload(
  req: IncomingMessage,
  res: ServerResponse,
  uploads: UploadStore,
  id: string,
  rawName: string,
): Promise<number> {
  const refuse = (refusal: PutRefusal) => {
    const status = PUT_STATUS[refusal];
    json(res, status, refusal === 'not_found' ? NOT_FOUND : { error: PUT_MESSAGE[refusal] });
    // A client that waits for 100-continue sends no body, and Node then closes the connection.
    discardRest(req);
    return status;
  };
  let name: string;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    name = '';
  }
  const length = req.headers['content-length'];
  const declared = length === undefined ? undefined : Number(length);
  const opened = uploads.open(id, name, declared);
  // open checks the id before anything else, so a dead id never learns more than 404.
  if (typeof opened === 'string') return refuse(opened);
  if (req.headers.expect?.toLowerCase() === '100-continue') res.writeContinue();
  const outcome = await receive(req, opened);
  if (outcome === 'aborted') {
    opened.abort();
    return 499;
  }
  if (outcome !== 'end') return refuse(outcome);
  const stored = opened.commit();
  if (stored === 'not_found') return refuse('not_found');
  json(res, 201, stored);
  return 201;
}

export async function startHosted(o: HostedOptions): Promise<HostedHandle> {
  if (o.token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`PASSWERK_AUTH_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  const token = Buffer.from(o.token);
  const log = o.log ?? (() => {});
  const clock = o.clock ?? (() => new Date());
  const publicUrl = o.publicUrl === undefined ? undefined : parsePublicUrl(o.publicUrl);
  const deps: ServerDeps = {
    registry: o.registry ?? new TaskRegistry(),
    tickMs: o.tickMs ?? 1000,
    seriesDir: o.seriesDir ?? fileURLToPath(new URL('../../../demo/series', import.meta.url)),
    clock,
    uploads: o.uploads ?? new UploadStore({ now: clock }),
    reading: o.reading ?? false,
  };
  const maxRequestBodySize = o.maxBodyBytes ?? 1536 * 1024;
  const mcp = createMcpHandler(
    ({ requestInfo }) => createServer(deps, { origin: originFor(publicUrl, requestInfo) }),
    {
      legacy: 'reject',
      maxRequestBodySize,
      onerror: (e) => log(`mcp error: ${e.message}`),
    },
  );
  const handle = toNodeHandler(mcp, { maxRequestBodySize });

  const onRequest = (req: IncomingMessage, res: ServerResponse) => {
    const rawPath = (req.url ?? '/').split('?')[0] ?? '/';
    const upload = UPLOAD_PATH.exec(rawPath);
    if (upload !== null && req.method === 'PUT') {
      const [, id = '', name = ''] = upload;
      putUpload(req, res, deps.uploads, id, name).then(
        (status) => log(`PUT /upload ${status}`),
        (e: unknown) => {
          log(`PUT /upload failed: ${e instanceof Error ? e.name : 'error'}`);
          if (!res.headersSent) json(res, 500, { error: 'internal error' });
        },
      );
      return;
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true });
    if (path !== '/mcp') return json(res, 404, NOT_FOUND);
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
    if (req.headers.expect?.toLowerCase() === '100-continue') res.writeContinue();
    // A server-side IncomingMessage always has a method and a url; the type keeps them optional.
    handle(req as Parameters<typeof handle>[0], res).catch((e: unknown) => {
      log(`handler failed: ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent) json(res, 500, { error: 'internal error' });
    });
  };

  const http = createHttpServer(onRequest);
  // Answering `Expect: 100-continue` ourselves lets a refused upload fail before its body.
  http.on('checkContinue', onRequest);

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
