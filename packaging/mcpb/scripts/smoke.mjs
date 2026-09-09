#!/usr/bin/env node
/**
 * Proves the shipped .mcpb actually runs (spec section 5): unzip it, start the launcher the
 * manifest names, complete the MCP handshake, and read a real supplier PDF through the
 * bundled pdfjs-dist — the highest-risk dependency in the tree, because it is a lazy dynamic
 * import with its own asset layout.
 *
 *   pnpm package:mcpb && pnpm package:smoke
 *
 * Sovereignty is deliberately not re-proven here: sovereignty.test.ts and the --network none
 * CI job already cover exactly the code this bundle vendors (ADR D-013).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { rpcCollect } from '../../../tools/release/stdio-client.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const VERSION = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'server', 'package.json'), 'utf8'),
).version;
const BUNDLE = join(ROOT, 'out', 'mcpb', `passwerk-${VERSION}.mcpb`);
const FIXTURES = join(ROOT, 'packages', 'core', 'test', 'fixtures', 'musterwerk');
const CLOCK = '2026-09-09T00:00:00.000Z';

let failed = false;
function check(ok, msg) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}: ${msg}`);
  if (!ok) failed = true;
}

const dir = mkdtempSync(join(tmpdir(), 'passwerk-mcpb-'));
try {
  // 1. unzip
  const zip = unzipSync(readFileSync(BUNDLE));
  for (const [path, bytes] of Object.entries(zip)) {
    if (path.endsWith('/')) continue;
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  console.log(`unzipped ${Object.keys(zip).length} entries into ${dir}`);

  // 2. the manifest ships the right version and the whole tool surface
  const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json']));
  check(manifest.version === VERSION, `manifest version ${manifest.version} === ${VERSION}`);
  check(manifest.tools.length === 12, `manifest declares ${manifest.tools.length} tools`);
  check(manifest.server.entry_point === 'server/index.js', 'entry_point is server/index.js');

  // 3. the launcher the manifest names starts and answers
  const bin = join(dir, manifest.server.entry_point);
  const [list, read, ingest] = await rpcCollect({
    bin,
    cwd: dir,
    env: { PASSWERK_ROOT: FIXTURES, PASSWERK_CLOCK: CLOCK },
    timeoutMs: 120000,
    requests: [
      { method: 'tools/list' },
      { method: 'resources/read', params: { uri: 'ui://passwerk/workbench.html' } },
      {
        method: 'tools/call',
        params: {
          name: 'ingest_documents',
          arguments: {
            paths: [join(FIXTURES, 'lieferantenerklaerung.pdf')],
            detail: 'full',
          },
        },
      },
    ],
  });

  const names = list.tools.map((t) => t.name).sort();
  check(names.length === 12, `tools/list returned ${names.length} tools`);
  check(
    JSON.stringify(names) === JSON.stringify(manifest.tools.map((t) => t.name).sort()),
    'tools/list matches the manifest',
  );
  check(
    typeof read.contents?.[0]?.text === 'string' && read.contents[0].text.length > 100000,
    `workbench is ${read.contents?.[0]?.text?.length ?? 0} bytes`,
  );

  // 4. the bundled pdfjs-dist really reads a PDF, with provenance
  check(
    ingest.isError !== true,
    `ingest_documents did not error: ${JSON.stringify(ingest.content?.[0]?.text ?? '').slice(0, 300)}`,
  );
  const structured = ingest.structuredContent;
  const summary = structured?.documents?.[0];
  check(
    summary?.name === 'lieferantenerklaerung.pdf' && summary?.format === 'pdf',
    `document summary is ${JSON.stringify({ name: summary?.name, format: summary?.format })}`,
  );
  check((summary?.pages ?? 0) > 0, `document has ${summary?.pages ?? 0} pages`);
  check((summary?.lines ?? 0) > 0, `document has ${summary?.lines ?? 0} lines`);

  const bundleDoc = structured?.bundle?.documents?.[0];
  const firstLine = bundleDoc?.pages?.[0]?.lines?.[0];
  check(
    typeof firstLine?.text === 'string' && firstLine.text.length > 0,
    `page 1 line 1 text is ${JSON.stringify(firstLine?.text)}`,
  );
  check(
    firstLine?.source !== undefined && typeof firstLine.source === 'object',
    `page 1 line 1 carries a source: ${JSON.stringify(firstLine?.source)}`,
  );

  const lines = bundleDoc?.pages?.[0]?.lines ?? [];
  check(
    lines.some((l) => typeof l.text === 'string' && l.text.includes('MW-EV-2026-000123')),
    'page 1 carries the supplier declaration serial',
  );
} finally {
  // Windows: the killed child process can hold its cwd/handles open for a moment after
  // child.kill() returns, which turns a plain rmSync into a transient EBUSY/ENOTEMPTY. Retry
  // instead of widening the try, so a real cleanup failure still throws.
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

if (failed) {
  console.error('\nmcpb smoke FAILED');
  process.exit(1);
}
console.log('\nmcpb smoke passed');
