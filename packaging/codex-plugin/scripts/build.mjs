#!/usr/bin/env node
/**
 * Assembles out/codex-plugin/: the manifests plus a copy of skills/passwerk. The skill has one
 * source; copying it here (and asserting the copy in the test) is what keeps the plugin from
 * drifting from the skill Claude Code reads.
 *
 *   pnpm package:codex
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const OUT = join(ROOT, 'out', 'codex-plugin');

const VERSION = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'server', 'package.json'), 'utf8'),
).version;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, '.codex-plugin'), { recursive: true });

// version is injected, never committed: one source of truth is the server package.
const manifest = JSON.parse(readFileSync(join(HERE, '.codex-plugin', 'plugin.json'), 'utf8'));
const { name, ...rest } = manifest;
writeFileSync(
  join(OUT, '.codex-plugin', 'plugin.json'),
  `${JSON.stringify({ name, version: VERSION, ...rest }, null, 2)}\n`,
);

cpSync(join(HERE, '.mcp.json'), join(OUT, '.mcp.json'));
cpSync(join(ROOT, 'skills', 'passwerk'), join(OUT, 'skills', 'passwerk'), { recursive: true });

console.log(`built ${OUT} (passwerk ${VERSION})`);
console.log('install locally:');
console.log(`  cp -r ${OUT} ~/plugins/passwerk`);
console.log(`  cp ${join(HERE, 'marketplace.json')} ~/.agents/plugins/marketplace.json`);
console.log('  codex plugin add passwerk@personal');
