import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocx } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const FIX = join(import.meta.dirname, 'fixtures', 'musterwerk');

describe('docx reader', () => {
  const [page] = readDocx({
    name: 'handover-notes.docx',
    bytes: new Uint8Array(readFileSync(join(FIX, 'handover-notes.docx'))),
  });
  it('paragraphs become lines in document order', () => {
    expect(page!.lines.map((l) => l.text)).toEqual([
      'Übergabedokumentation Musterwerk EV-Pack MW-EV-2026-000123',
      'Die folgenden Dokumente werden mit der Batterie übergeben.',
      'Ende der Übergabedokumentation.',
    ]);
    expect(page!.lines[2]!.source).toEqual({
      file: 'handover-notes.docx',
      page: 1,
      note: 'line 3',
    });
  });
  it('tables become cell grids with T:R:C refs', () => {
    const t = page!.tables[0]!;
    expect(t.rows[0]!.map((c) => c.text)).toEqual(['Dokument', 'Sprache', 'Version']);
    expect(t.rows[3]![1]).toMatchObject({
      text: 'de, en',
      ref: 'T1:R4C2',
      source: { file: 'handover-notes.docx', page: 1, cell: 'T1:R4C2' },
    });
  });
  it('is German', () => {
    expect(page!.lang).toBe('de');
  });
});
