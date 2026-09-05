/**
 * Dev-only: regenerates kb/generated/*.json from the bundled artefacts.
 *
 *   pnpm --filter @passwerk/rules run generate
 *
 * The test suite rebuilds the same data in-process and asserts it equals the committed files,
 * so a stale kb/generated/ fails CI.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArtefactManifest } from '../src/types.ts';
import { buildCatalogue } from './lib/catalogue.ts';
import { extractLonglist } from './lib/longlist.ts';
import { renderProvenance } from './lib/provenance.ts';
import { extractSammModel } from './lib/samm.ts';
import {
  LONGLIST_FILE,
  loadSammInputs,
  loadTemplateInputs,
  SAMM_FILES,
  TEMPLATE_FILES,
} from './lib/sources.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const outDir = resolve(pkg, 'kb/generated');

await mkdir(outDir, { recursive: true });

const catalogue = buildCatalogue(await loadTemplateInputs(pkg));
await writeFile(
  resolve(outDir, 'template-catalogue.json'),
  `${JSON.stringify(catalogue, null, 2)}\n`,
);
console.log(
  `template-catalogue.json: ${catalogue.templates.length} templates, ${catalogue.templates.reduce((n, t) => n + t.elementCount, 0)} elements (${TEMPLATE_FILES.length} inputs)`,
);

const longlist = extractLonglist(new Uint8Array(await readFile(resolve(pkg, LONGLIST_FILE))));
await writeFile(resolve(outDir, 'din-longlist.json'), `${JSON.stringify(longlist, null, 2)}\n`);
console.log(`din-longlist.json: ${longlist.rows.length} rows`);

const samm = extractSammModel(await loadSammInputs(pkg));
await writeFile(resolve(outDir, 'batterypass-samm.json'), `${JSON.stringify(samm, null, 2)}\n`);
console.log(
  `batterypass-samm.json: ${samm.sections.length} aspect models, ${samm.sections.reduce((n, s) => n + s.propertyCount, 0)} properties (${SAMM_FILES.length} inputs)`,
);

const manifest = JSON.parse(
  await readFile(resolve(pkg, 'artefacts/manifest.json'), 'utf8'),
) as ArtefactManifest;
await writeFile(resolve(pkg, 'PROVENANCE.md'), renderProvenance(manifest));
console.log(`PROVENANCE.md: ${manifest.artefacts.length} artefacts`);
