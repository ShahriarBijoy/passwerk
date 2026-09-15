#!/usr/bin/env node
/**
 * Generates plugins/passwerk/, the plugin Claude Code and Codex install straight from this
 * repository (`claude plugin install passwerk@passwerk`, `codex plugin add passwerk@passwerk`).
 * Every file is derived: the Claude manifest from packaging/agent-plugin, the Codex manifest
 * and .mcp.json from packaging/codex-plugin, the version from packages/server, the skill from
 * skills/passwerk. The directory is committed because a Git marketplace is installed without
 * a build step; `--check` fails when it has drifted from its sources.
 *
 *   pnpm sync:plugin            regenerate plugins/passwerk
 *   pnpm sync:plugin --check    exit 1 and name each drifted file
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const OUT = join(ROOT, 'plugins', 'passwerk');
const CODEX = join(ROOT, 'packaging', 'codex-plugin');
const SKILL = join(ROOT, 'skills', 'passwerk');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const toJson = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const withVersion = ({ name, ...rest }, version) => ({ name, version, ...rest });
const posix = (from, file) => relative(from, file).split(sep).join('/');

function files(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

function expected() {
  const version = readJson(join(ROOT, 'packages', 'server', 'package.json')).version;
  const claude = readJson(join(HERE, '.claude-plugin', 'plugin.json'));
  const codex = readJson(join(CODEX, '.codex-plugin', 'plugin.json'));
  const out = new Map([
    ['.claude-plugin/plugin.json', toJson(withVersion(claude, version))],
    ['.codex-plugin/plugin.json', toJson(withVersion(codex, version))],
    ['.mcp.json', readFileSync(join(CODEX, '.mcp.json'))],
  ]);
  for (const file of files(SKILL)) {
    out.set(`skills/passwerk/${posix(SKILL, file)}`, readFileSync(file));
  }
  return out;
}

function drift(want) {
  let have = [];
  try {
    have = files(OUT).map((file) => posix(OUT, file));
  } catch {
    // A missing directory shows up below as every expected file missing.
  }
  const stale = [...want].flatMap(([rel, bytes]) => {
    try {
      return readFileSync(join(OUT, rel)).equals(bytes) ? [] : [`differs: ${rel}`];
    } catch {
      return [`missing: ${rel}`];
    }
  });
  const extra = have.filter((rel) => !want.has(rel)).map((rel) => `unexpected: ${rel}`);
  return [...stale, ...extra];
}

const want = expected();

if (process.argv.includes('--check')) {
  const problems = drift(want);
  if (problems.length > 0) {
    console.error('plugins/passwerk is out of date; run `pnpm sync:plugin`:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`plugins/passwerk is up to date (${want.size} files)`);
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [rel, bytes] of want) {
    mkdirSync(dirname(join(OUT, rel)), { recursive: true });
    writeFileSync(join(OUT, rel), bytes);
  }
  console.log(`wrote ${want.size} files to plugins/passwerk`);
}
