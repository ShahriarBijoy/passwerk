/**
 * Emit every golden sample as AAS JSON and AASX into out/ together with passwerk's own
 * verdict, so oracle.py can check verdict parity (ADR D-012). Runs after `pnpm build`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROKEN_SAMPLE_NAMES,
  getSample,
  packAasx,
  VALID_SAMPLE_NAMES,
  validate,
} from '@passwerk/core';
import { buildExpected, type ExpectedInput, fileNameFor } from './expected.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'out');
const require = createRequire(import.meta.url);
const coreVersion = (require('@passwerk/core/package.json') as { version: string }).version;

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const inputs: ExpectedInput[] = [];
for (const sample of [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES]) {
  const report = validate(getSample(sample));
  if (!report.aasJson) {
    console.error(
      `emit-golden: ${sample} produced no AAS JSON (L1 schema failure); cannot oracle-check`,
    );
    process.exit(1);
  }
  const aasx = packAasx(report.aasJson);
  writeFileSync(join(OUT, fileNameFor(sample, 'json')), report.aasJson);
  writeFileSync(join(OUT, fileNameFor(sample, 'aasx')), aasx);
  inputs.push({ sample, format: 'json', sha256: sha256(report.aasJson), report });
  inputs.push({ sample, format: 'aasx', sha256: sha256(aasx), report });
  console.log(`${sample}: ${report.verdict} (L2 errors ${report.layers.L2.errors})`);
}

const expected = buildExpected(`@passwerk/core ${coreVersion}`, inputs);
writeFileSync(join(OUT, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`);
console.log(`wrote ${expected.files.length} entries to ${join(OUT, 'expected.json')}`);
