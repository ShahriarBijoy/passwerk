#!/usr/bin/env node
/**
 * Proves the published packages work outside the monorepo (spec section 8.3): pack the four
 * packages, install the tarballs into an empty temp project, then run the server binary,
 * a stdio tools/list, `passwerk audit` and `passwerk carrier`. Exit 1 on the first failure.
 *
 *   pnpm build && pnpm release:pack && node tools/release/pack-smoke.mjs
 *
 * Adjustment vs. the brief's single `npm install <tarball...>`: the `@passwerk` scope is not
 * published to the registry yet, so npm cannot resolve `@passwerk/core`'s dependency on
 * `@passwerk/rules@0.1.0` (or server/cli's on core) from a sibling tarball path alone — it
 * tries the registry and 404s. Installing the tarballs one at a time in dependency order
 * (rules, core, server, cli) makes each package already present in node_modules by the time
 * the next one is installed, so npm resolves the workspace dependency locally instead.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const PACK = join(ROOT, 'out', 'pack');
const VERSION = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'server', 'package.json'), 'utf8'),
).version;
const shell = process.platform === 'win32';

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    shell,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

// Dependency order matters: each tarball must already be installed before the next one's
// `npm install` runs, so npm resolves the unpublished `@passwerk/*` deps from node_modules
// instead of the registry.
const ORDER = ['rules', 'core', 'server', 'cli'];
const tarballs = ORDER.map((name) => join(PACK, `passwerk-${name}-${VERSION}.tgz`));
for (const t of tarballs) {
  try {
    readFileSync(t);
  } catch {
    fail(`expected tarball ${t}, not found (run pnpm release:pack first)`);
  }
}

const dir = mkdtempSync(join(tmpdir(), 'passwerk-smoke-'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));
console.log(`installing ${tarballs.length} tarballs into ${dir}`);
for (const t of tarballs) {
  sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', t], dir);
}

const serverBin = join(dir, 'node_modules', '@passwerk', 'server', 'dist', 'bin.js');
const cliBin = join(dir, 'node_modules', '@passwerk', 'cli', 'dist', 'bin.js');

// 1. version through npx (the DoD command shape)
const v = sh('npx', ['--no-install', 'passwerk-server', '--version'], dir).trim();
if (v !== VERSION) fail(`passwerk-server --version printed "${v}", expected ${VERSION}`);
console.log(`ok: passwerk-server --version = ${v}`);

// 2. stdio initialize + tools/list
const tools = await new Promise((resolvePromise) => {
  const child = spawn(process.execPath, [serverBin], {
    cwd: dir,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    for (const line of buf.split('\n')) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id === 2) {
        child.kill();
        resolvePromise(msg.result.tools.map((t) => t.name));
      }
    }
  });
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
  setTimeout(() => fail('tools/list timed out'), 30000).unref();
});
if (tools.length !== 11 || !tools.includes('generate_carrier'))
  fail(`tools/list: ${tools.join(', ')}`);
console.log(`ok: tools/list -> ${tools.length} tools`);

// 3. audit a golden draft
copyFileSync(
  join(ROOT, 'packages', 'core', 'src', 'samples', 'ev-valid.json'),
  join(dir, 'ev-valid.json'),
);
const audit = sh(process.execPath, [cliBin, 'audit', 'ev-valid.json'], dir);
if (!audit.startsWith('Verdict: valid.')) fail(`audit: ${audit}`);
console.log('ok: passwerk audit ev-valid.json -> valid');

// 4. carrier
sh(process.execPath, [cliBin, 'carrier', 'ev-valid.json', '--out', 'qr.svg'], dir);
if (!readFileSync(join(dir, 'qr.svg'), 'utf8').startsWith('<svg'))
  fail('carrier did not write an SVG');
console.log('ok: passwerk carrier -> qr.svg');

rmSync(dir, { recursive: true, force: true });
console.log('pack smoke: OK');
