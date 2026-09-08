#!/usr/bin/env node
/**
 * Copies a built single-file HTML into packages/server/ui/workbench.html, the path bin.ts
 * serves as ui://passwerk/workbench.html (ADR D-037). Argument: the source, relative to
 * apps/mcp-app (default dist/index.html).
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [src] = process.argv.slice(2);
const here = resolve(import.meta.dirname, '..');
const from = resolve(here, src ?? 'dist/index.html');
const to = resolve(here, '..', '..', 'packages', 'server', 'ui', 'workbench.html');
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log(`${to} (${statSync(to).size} bytes)`);
