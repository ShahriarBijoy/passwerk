import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateAll, REPORT_PATH } from '../src/heldout/evaluate.js';
import { generateHeldout, HELDOUT_DIR } from '../src/heldout/generate.js';

describe('held-out evaluation set (ADR D-024)', () => {
  it('committed documents and manifest are exactly what the generator produces', async () => {
    const files = await generateHeldout();
    expect(Object.keys(files).sort()).toEqual([
      'ampere-storage-datenblatt.docx',
      'bosch-powertube-750-haendlerdaten.csv',
      'byd-battery-box-premium-hvs.xlsx',
      'eve-lf280k-fundamental-parameters.csv',
      'expected.json',
      'tesvolt-ts-i-hv-80-e.pdf',
      'webasto-standard-battery-pro-40.txt',
    ]);
    for (const [name, bytes] of Object.entries(files)) {
      const committed = new Uint8Array(readFileSync(join(HELDOUT_DIR, name)));
      expect(committed.length, name).toBe(bytes.length);
      expect(Buffer.compare(Buffer.from(committed), Buffer.from(bytes)), name).toBe(0);
    }
  });
  it('docs/EVALUATION.md matches a fresh evaluation run', async () => {
    const { report } = await evaluateAll();
    expect(readFileSync(REPORT_PATH, 'utf8').replace(/\r\n/g, '\n')).toBe(report);
  });
  it('the report is honest about a documented miss and never claims full recall', async () => {
    const { heldout } = await evaluateAll();
    expect(heldout.totals.expected).toBeGreaterThan(20);
    expect(heldout.totals.manual + heldout.totals.edits + heldout.totals.rejects).toBeGreaterThan(
      0,
    );
  });
});
