#!/usr/bin/env node
/**
 * Proves the published packages work outside the monorepo (spec section 8.3): pack the four
 * packages, install the tarballs into an empty temp project, then run the server binary,
 * a stdio tools/list plus the workbench resource, `passwerk audit` and `passwerk carrier`.
 * Exit 1 on the first failure.
 * The temp project is always removed, success or failure.
 *
 *   pnpm build && pnpm build:mcp-app && pnpm release:pack && node tools/release/pack-smoke.mjs
 *
 * Adjustment vs. the brief's single `npm install <tarball...>`: the `@passwerk` scope is not
 * published to the registry yet, so npm cannot resolve `@passwerk/core`'s dependency on
 * `@passwerk/rules@0.1.0` (or server/cli's on core) from a sibling tarball path alone — it
 * tries the registry and 404s. Installing the tarballs one at a time in dependency order
 * (rules, core, server, cli) makes each package already present in node_modules by the time
 * the next one is installed, so npm resolves the workspace dependency locally instead.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const PACK = join(ROOT, 'out', 'pack');
const VERSION = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'server', 'package.json'), 'utf8'),
).version;

class SmokeError extends Error {}
function fail(msg) {
  throw new SmokeError(msg);
}

/** `npm`/`npx` are `.cmd` shims on Windows and need a shell to be found on PATH. */
function shShell(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

/** Direct node invocation: no shell, so paths with spaces are passed through untouched. */
function shNode(args, cwd) {
  const r = spawnSync(process.execPath, args, {
    cwd,
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0)
    fail(`${process.execPath} ${args.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

/**
 * Talks the stdio JSON-RPC handshake to the freshly installed server: initialize, then
 * tools/list (id 2) and a resources/read of the MCP App workbench (id 3, ADR D-037). Frames
 * newline-delimited JSON correctly across `data` chunks (keeps only the trailing partial line
 * in the buffer) and always kills the child before settling, on every path: success, a
 * malformed line, a process error or the timeout. Resolves `{ tools, workbench }`.
 */
async function stdioSurface(serverBin, cwd) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [serverBin], {
      cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    let buf = '';
    let settled = false;
    const result = {};
    const timer = setTimeout(
      () => settle(rejectPromise, new SmokeError('stdio tools/list + resources/read timed out')),
      30000,
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
          settle(rejectPromise, new SmokeError(`could not parse stdio line: ${line}\n${err}`));
          return;
        }
        if (msg.id === 2) {
          if (msg.error) {
            settle(rejectPromise, new SmokeError(`tools/list error: ${JSON.stringify(msg.error)}`));
            return;
          }
          result.tools = msg.result.tools;
        } else if (msg.id === 3) {
          if (msg.error) {
            settle(
              rejectPromise,
              new SmokeError(`resources/read workbench error: ${JSON.stringify(msg.error)}`),
            );
            return;
          }
          result.workbench = msg.result.contents[0];
        }
        if (result.tools && result.workbench) {
          settle(resolvePromise, result);
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
        clientInfo: { name: 'smoke', version: '0' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/read',
      params: { uri: 'ui://passwerk/workbench.html' },
    });
  });
}

async function main() {
  // Dependency order matters: each tarball must already be installed before the next one's
  // `npm install` runs, so npm resolves the unpublished `@passwerk/*` deps from node_modules
  // instead of the registry.
  const ORDER = ['rules', 'core', 'server', 'cli'];
  const tarballs = ORDER.map((name) => join(PACK, `passwerk-${name}-${VERSION}.tgz`));
  for (const t of tarballs) {
    if (!existsSync(t)) fail(`expected tarball ${t}, not found (run pnpm release:pack first)`);
  }

  const dir = mkdtempSync(join(tmpdir(), 'passwerk-smoke-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));
    console.log(`installing ${tarballs.length} tarballs into ${dir}`);
    for (const t of tarballs) {
      shShell('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', t], dir);
    }

    const serverBin = join(dir, 'node_modules', '@passwerk', 'server', 'dist', 'bin.js');
    const cliBin = join(dir, 'node_modules', '@passwerk', 'cli', 'dist', 'bin.js');

    // 1. version through npx (the DoD command shape)
    const v = shShell('npx', ['--no-install', 'passwerk-server', '--version'], dir).trim();
    if (v !== VERSION) fail(`passwerk-server --version printed "${v}", expected ${VERSION}`);
    console.log(`ok: passwerk-server --version = ${v}`);

    // 2. stdio initialize + tools/list + the MCP App workbench resource (ADR D-037)
    const { tools, workbench } = await stdioSurface(serverBin, dir);
    const names = tools.map((t) => t.name);
    if (names.length !== 12 || !names.includes('generate_carrier'))
      fail(`tools/list: ${names.join(', ')}`);
    const review = tools.find((t) => t.name === 'review_passport');
    if (review?._meta?.ui?.resourceUri !== 'ui://passwerk/workbench.html')
      fail(`review_passport lacks _meta.ui.resourceUri: ${JSON.stringify(review?._meta)}`);
    console.log(`ok: tools/list -> ${names.length} tools, review_passport carries the workbench`);
    if (workbench.mimeType !== 'text/html;profile=mcp-app')
      fail(`workbench mime is ${workbench.mimeType}`);
    if (typeof workbench.text !== 'string' || workbench.text.length < 100000)
      fail(
        'workbench missing from the server tarball (run pnpm build:mcp-app before release:pack)',
      );
    console.log(`ok: ui://passwerk/workbench.html -> ${workbench.text.length} bytes`);

    // 3. audit a golden draft
    copyFileSync(
      join(ROOT, 'packages', 'core', 'src', 'samples', 'ev-valid.json'),
      join(dir, 'ev-valid.json'),
    );
    const audit = shNode([cliBin, 'audit', 'ev-valid.json'], dir);
    if (!audit.startsWith('Verdict: valid.')) fail(`audit: ${audit}`);
    console.log('ok: passwerk audit ev-valid.json -> valid');

    // 4. carrier
    shNode([cliBin, 'carrier', 'ev-valid.json', '--out', 'qr.svg'], dir);
    if (!readFileSync(join(dir, 'qr.svg'), 'utf8').startsWith('<svg'))
      fail('carrier did not write an SVG');
    console.log('ok: passwerk carrier -> qr.svg');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .then(() => console.log('pack smoke: OK'))
  .catch((err) => {
    console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
