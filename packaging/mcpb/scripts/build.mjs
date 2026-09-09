#!/usr/bin/env node
/**
 * Builds out/mcpb/passwerk-<version>.mcpb: a Claude Desktop bundle that vendors the release
 * tarballs, so a one-click install never touches the network (spec section 4).
 *
 *   pnpm build && pnpm build:mcp-app && pnpm release:pack && pnpm package:mcpb
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
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

/**
 * Runs a JS entry point directly through this process's own node binary: no shell, so a
 * checkout path or temp directory with a space in it is passed through untouched (`npm` and
 * `mcpb` are `.cmd` shims on Windows, which cannot be spawned with `shell: false` at all — this
 * sidesteps the shim entirely by calling the real JS CLI, the same no-shell shape as
 * `tools/release/pack-smoke.mjs`'s `shNode`).
 */
function shNode(scriptAndArgs, cwd) {
  const r = spawnSync(process.execPath, scriptAndArgs, {
    cwd,
    shell: false,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (r.status !== 0)
    fail(
      `${process.execPath} ${scriptAndArgs.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`,
    );
  return r.stdout;
}

/**
 * The npm bundled with the node binary running this script — never a `.cmd` shim resolved off
 * PATH. npm ships inside every Node.js distribution; the JS entry point sits either beside
 * `node.exe` (Windows layout) or under `<prefix>/lib` (POSIX layout, `<prefix>/bin/node`).
 */
function resolveNpmCli() {
  const nodeDir = dirname(process.execPath);
  const candidates = [
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const found = candidates.find(existsSync);
  if (!found)
    fail(
      `cannot find the npm bundled with ${process.execPath} (checked:\n  ${candidates.join('\n  ')})\n` +
        'npm ships with every Node.js install; reinstall Node rather than falling back to a PATH lookup.',
    );
  return found;
}

/**
 * The pinned @anthropic-ai/mcpb devDependency's own CLI entry (dist/cli/cli.js per its
 * package.json `bin`), resolved through node's normal module resolution so it works whether
 * pnpm hoists or keeps it in the content-addressed store. Never `npx mcpb`: npx falls back to
 * downloading the latest published version from the registry when node_modules lacks a local
 * copy, silently validating and packing with an unpinned, possibly newer CLI (this schema is
 * version-sensitive — the 2.1.2 requirement for `prompts[].text` was discovered the hard way).
 * Resolving explicitly fails loudly instead, with no network fallback.
 */
function resolveMcpbCli() {
  const req = createRequire(import.meta.url);
  let indexPath;
  try {
    indexPath = req.resolve('@anthropic-ai/mcpb');
  } catch {
    fail(
      '@anthropic-ai/mcpb is not installed (checked via node module resolution from ' +
        `${import.meta.url}). Run pnpm install — this must never fall back to npx, which would ` +
        'download an unpinned version from the network.',
    );
  }
  const cli = join(dirname(indexPath), 'cli', 'cli.js');
  if (!existsSync(cli))
    fail(`@anthropic-ai/mcpb is installed but its CLI entry is missing: ${cli}`);
  return cli;
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
const npmCli = resolveNpmCli();
for (const t of tarballs) {
  console.log(`installing ${t}`);
  shNode(
    [
      npmCli,
      'install',
      '--omit=dev',
      '--omit=optional',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      t,
    ],
    SERVER,
  );
}

// 2b. npm wrote build-machine tarball paths into server/package.json's dependencies
//     (e.g. "file:../../../pack/passwerk-core-0.1.0.tgz"). The bundle never runs npm again —
//     Claude Desktop only imports the installed files — but the file is real and shipped, so a
//     user's own `npm ls` or audit inside the bundle would see a nonsense spec pointing at a
//     path that does not exist on their machine. Rewrite it to the plain version every tarball
//     shares.
{
  const serverPkgPath = join(SERVER, 'package.json');
  const serverPkg = JSON.parse(readFileSync(serverPkgPath, 'utf8'));
  if (serverPkg.dependencies) {
    for (const name of Object.keys(serverPkg.dependencies)) serverPkg.dependencies[name] = VERSION;
  }
  writeFileSync(serverPkgPath, `${JSON.stringify(serverPkg, null, 2)}\n`);
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

// 5. validate, then pack — the pinned mcpb CLI, never npx
const mcpbCli = resolveMcpbCli();
console.log(shNode([mcpbCli, 'validate', join(BUILD, 'manifest.json')], ROOT));
console.log(shNode([mcpbCli, 'pack', BUILD, join(OUT, `passwerk-${VERSION}.mcpb`)], ROOT));
console.log(`built ${join(OUT, `passwerk-${VERSION}.mcpb`)}`);
