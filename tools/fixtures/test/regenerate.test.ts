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
  it('zip entry timestamps do not depend on the timezone of the generating machine', async () => {
    // fflate writes the DOS date/time of each entry from local-time getters, so the same
    // mtime instant produces different bytes in Berlin and on a UTC CI runner. The writers
    // therefore pass an mtime built from local components (2026-09-01 08:00:00), which
    // encodes to the same DOS fields everywhere.
    const files = await generateFixtures();
    for (const name of ['stueckliste.xlsx', 'handover-notes.docx']) {
      const bytes = files[name] as Uint8Array;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getUint32(0, true), `${name} local header signature`).toBe(0x04034b50);
      const dosTime = view.getUint16(10, true);
      const dosDate = view.getUint16(12, true);
      // hour 8 << 11 | minute 0 << 5 | seconds/2 0
      expect(dosTime, `${name} DOS time`).toBe(8 << 11);
      // (2026 - 1980) << 9 | month 9 << 5 | day 1
      expect(dosDate, `${name} DOS date`).toBe(((2026 - 1980) << 9) | (9 << 5) | 1);
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
