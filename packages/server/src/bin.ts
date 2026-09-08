#!/usr/bin/env node
/**
 * `passwerk-server`: stdio by default, `--http [port]` for Streamable HTTP.
 * The only place the wall clock and process environment are read.
 */
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { nodeFileSystem } from './fs.js';
import { startHttp } from './http.js';
import { stderrLogger } from './logging.js';
import { SERVER_NAME, SERVER_VERSION } from './meta.js';
import { createServer } from './server.js';

const HELP = `${SERVER_NAME} ${SERVER_VERSION}: MCP server for EU battery passports (offline, no model calls)

Usage: passwerk-server [--http [port]] [--host <host>] [--root <dir>]

  (no flags)        stdio transport (Claude Code, Codex, Cursor, Claude Desktop)
  --http [port]     Streamable HTTP on <host>:<port> (default 127.0.0.1:3777); needs PASSWERK_AUTH_TOKEN
  --host <host>     bind address for --http (default 127.0.0.1)
  --root <dir>      restrict ingest paths and emit outDir to this directory (default: cwd, unrestricted)
  --version, --help

Environment: PASSWERK_AUTH_TOKEN, PASSWERK_ROOT, PASSWERK_LOG_LEVEL=info|debug, PASSWERK_LOG_PAYLOADS=1
`;

interface Args {
  http: boolean;
  port: number;
  host: string;
  root?: string;
  version: boolean;
  help: boolean;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv): Args {
  const args: Args = { http: false, port: 3777, host: '127.0.0.1', version: false, help: false };
  if (env['PASSWERK_ROOT']) args.root = env['PASSWERK_ROOT'];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--http') {
      args.http = true;
      if (next !== undefined && /^\d+$/.test(next)) {
        args.port = Number(next);
        i++;
      }
    } else if (a === '--host' && next !== undefined) {
      args.host = next;
      i++;
    } else if (a === '--root' && next !== undefined) {
      args.root = next;
      i++;
    } else if (a === '--version' || a === '-v') args.version = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

export async function main(argv = process.argv.slice(2), env = process.env): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv, env);
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n${HELP}`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return 0;
  }
  const log = stderrLogger(env['PASSWERK_LOG_LEVEL'] === 'debug' ? 'debug' : 'info');
  const logPayloads = env['PASSWERK_LOG_PAYLOADS'] === '1';
  // The MCP App (ADR D-037): `pnpm build:mcp-app` writes packages/server/ui/workbench.html,
  // which ships in the tarball beside dist/. Read per request so a rebuild needs no restart.
  const ui = { html: () => readFile(new URL('../ui/workbench.html', import.meta.url), 'utf8') };

  if (args.http) {
    const token = env['PASSWERK_AUTH_TOKEN'] ?? '';
    if (!token) {
      process.stderr.write(
        'PASSWERK_AUTH_TOKEN must be set for --http (bearer token required on /mcp)\n',
      );
      return 2;
    }
    const handle = await startHttp({
      host: args.host,
      port: args.port,
      token,
      ...(args.root !== undefined ? { root: args.root } : {}),
      log,
      logPayloads,
      ui,
    });
    const stop = () => {
      void handle.close().then(() => process.exit(0));
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return -1;
  }

  const { server } = createServer({
    fs: nodeFileSystem(args.root),
    clock: new Date().toISOString(),
    log,
    logPayloads,
    ui,
  });
  await server.connect(new StdioServerTransport());
  log('info', 'stdio transport connected', { root: args.root ?? process.cwd() });
  return -1;
}

const invokedDirectly =
  process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().then((code) => {
    if (code >= 0) process.exit(code);
  });
}
