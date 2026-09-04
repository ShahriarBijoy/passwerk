import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IngestFailure, readPdf } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const FIX = join(import.meta.dirname, 'fixtures');
const file = (dir: string, name: string) => ({
  name,
  bytes: new Uint8Array(readFileSync(join(FIX, dir, name))),
});

describe('pdf reader', () => {
  it('reads the supplier declaration: kv lines, a table, provenance', async () => {
    const [page] = await readPdf(file('musterwerk', 'lieferantenerklaerung.pdf'));
    expect(page).toMatchObject({ number: 1, lang: 'de', textless: false });
    expect(page!.lines[0]!.text).toBe('Lieferantenerklärung Batteriesystem MW-EV-2026-000123');
    expect(page!.lines[5]).toMatchObject({
      segments: ['Nennkapazität:', '94,5 Ah'],
      source: { file: 'lieferantenerklaerung.pdf', page: 1, note: 'line 6' },
    });
    const shares = page!.tables.find((t) => t.rows[0]?.[0]?.text === 'Rezyklatanteil')!;
    expect(shares.rows[1]!.map((c) => c.text)).toEqual(['Kobalt', '12,5 %', '4,0 %']);
    expect(shares.rows[1]![1]!.source).toEqual({
      file: 'lieferantenerklaerung.pdf',
      page: 1,
      cell: `T${shares.index}:R2C2`,
    });
  });
  it('an encrypted PDF is reported as encrypted', async () => {
    await expect(readPdf(file('edge', 'encrypted.pdf'))).rejects.toMatchObject({
      code: 'encrypted',
    });
  });
  it('garbage with a .pdf name is corrupt', async () => {
    await expect(readPdf(file('edge', 'not-a-pdf.pdf'))).rejects.toBeInstanceOf(IngestFailure);
  });
});
