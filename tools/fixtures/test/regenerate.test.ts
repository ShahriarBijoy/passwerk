import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURE_DIR, generateFixtures } from '../src/generate.js';

describe('committed fixtures are exactly what the generator produces (ADR D-009 pattern)', () => {
  it('byte equality for every file', async () => {
    const files = await generateFixtures();
    expect(Object.keys(files).sort()).toEqual([
      'datasheet-en.csv',
      'energierechnung.pdf',
      'handover-notes.docx',
      'lieferantenerklaerung.pdf',
      'stueckliste.xlsx',
    ]);
    for (const [name, bytes] of Object.entries(files)) {
      const committed = new Uint8Array(readFileSync(join(FIXTURE_DIR, name)));
      expect(committed.length, name).toBe(bytes.length);
      expect(Buffer.compare(Buffer.from(committed), Buffer.from(bytes)), name).toBe(0);
    }
  });
  it('is deterministic across two runs', async () => {
    const a = await generateFixtures();
    const b = await generateFixtures();
    for (const name of Object.keys(a))
      expect(
        Buffer.compare(Buffer.from(a[name] as Uint8Array), Buffer.from(b[name] as Uint8Array)),
        name,
      ).toBe(0);
  });
});
