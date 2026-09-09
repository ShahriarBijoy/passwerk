#!/usr/bin/env node
/**
 * Builds out/mcpb/passwerk-<version>.mcpb: a Claude Desktop bundle that vendors the release
 * tarballs, so a one-click install never touches the network (spec section 4).
 *
 *   pnpm build && pnpm build:mcp-app && pnpm release:pack && pnpm package:mcpb
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildManifest } from './manifest.mjs';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const PACK = join(ROOT, 'out', 'pack');
const OUT = join(ROOT, 'out', 'mcpb');
const BUILD = join(OUT, 'build');
const SERVER = join(BUILD, 'server');

const VERSION = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'server', 'package.json'), 'utf8'),
).version;

function fail(msg) {
  console.error(`packaging/mcpb: ${msg}`);
  process.exit(1);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, shell: true, encoding: 'utf8', stdio: 'pipe' });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

// 1. the three tarballs the server needs; the CLI is not part of an MCP host's surface.
//    Dependency order matters: the @passwerk scope is not on the registry, so each package must
//    already be in node_modules before the next one's install resolves it (as pack-smoke does).
const ORDER = ['rules', 'core', 'server'];
const tarballs = ORDER.map((n) => join(PACK, `passwerk-${n}-${VERSION}.tgz`));
for (const t of tarballs)
  if (!existsSync(t))
    fail(`missing ${t} — run pnpm build && pnpm build:mcp-app && pnpm release:pack`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(SERVER, { recursive: true });
writeFileSync(
  join(SERVER, 'package.json'),
  `${JSON.stringify({ name: 'passwerk-mcpb-server', private: true, type: 'module' }, null, 2)}\n`,
);

// 2. --omit=optional keeps pdfjs-dist's native canvas out: it is only used for rendering, never
//    for the text extraction passwerk does, and a platform binary would make the bundle
//    platform-specific. Everything left is pure JavaScript, so one bundle serves all three.
for (const t of tarballs) {
  console.log(`installing ${t}`);
  run(
    'npm',
    ['install', '--omit=dev', '--omit=optional', '--no-audit', '--no-fund', '--loglevel=error', t],
    SERVER,
  );
}

// 3. the workbench must have come along inside the server tarball (ADR D-037)
const workbench = join(SERVER, 'node_modules', '@passwerk', 'server', 'ui', 'workbench.html');
if (!existsSync(workbench))
  fail(
    'the server tarball has no ui/workbench.html — run pnpm build:mcp-app before pnpm release:pack',
  );

// 4. derive the manifest from the installed server's own registry
// pathToFileURL, not string concatenation: on Windows a manually built 'file://W:/...' parses
// 'W:' as the URL host rather than a drive letter, so a plain new URL() fails to import.
const installed = await import(
  pathToFileURL(join(SERVER, 'node_modules', '@passwerk', 'server', 'dist', 'index.js')).href
);
// mcpb 2.1.2's manifest schema requires a literal `text` per prompt (a static preview a host
// can show without calling the server). packages/server's prompts take lang/category
// arguments, so this is the real English, no-argument rendering — a deep import of the
// installed package's own prompt-text module, not new copy (dist/prompts/texts.js is not part
// of the package's public exports map, but it is a real file in the tarball).
const texts = await import(
  pathToFileURL(join(SERVER, 'node_modules', '@passwerk', 'server', 'dist', 'prompts', 'texts.js'))
    .href
);
const promptTexts = {
  'build-passport-interview': texts.buildPassportInterview('en'),
  'audit-supplier-submission': texts.auditSupplierSubmission('en'),
  'draft-data-request': texts.draftDataRequest('en'),
};
const manifest = buildManifest(JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8')), {
  version: VERSION,
  tools: installed.TOOLS.map((t) => ({ name: t.name, description: t.description })),
  promptNames: installed.PROMPT_NAMES,
  promptTexts,
});
writeFileSync(join(BUILD, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(join(HERE, 'icon.png'), join(BUILD, 'icon.png'));
copyFileSync(join(HERE, 'server', 'index.js'), join(SERVER, 'index.js'));

// 5. validate, then pack
console.log(run('npx', ['mcpb', 'validate', join(BUILD, 'manifest.json')], ROOT));
console.log(run('npx', ['mcpb', 'pack', BUILD, join(OUT, `passwerk-${VERSION}.mcpb`)], ROOT));
console.log(`built ${join(OUT, `passwerk-${VERSION}.mcpb`)}`);
