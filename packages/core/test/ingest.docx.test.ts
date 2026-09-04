import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocx } from '@passwerk/core';
import { strToU8, zipSync } from 'fflate';
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

describe('docx reader edge cases', () => {
  it('a w:tab becomes a column-like segment and a w:br starts a new Line', () => {
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      '<w:p><w:r><w:t xml:space="preserve">Nennkapazität:</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">94,5 Ah</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">Zeile A</w:t></w:r><w:r><w:br/></w:r><w:r><w:t xml:space="preserve">Zeile B</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const bytes = zipSync({ 'word/document.xml': strToU8(documentXml) });
    const [page] = readDocx({ name: 'edge.docx', bytes });
    expect(page!.lines.map((l) => l.text)).toEqual([
      'Nennkapazität:\t94,5 Ah',
      'Zeile A',
      'Zeile B',
    ]);
    expect(page!.lines[0]).toMatchObject({ segments: ['Nennkapazität:', '94,5 Ah'] });
    expect(page!.lines[1]).toMatchObject({
      source: { file: 'edge.docx', page: 1, note: 'line 2' },
    });
    expect(page!.lines[2]).toMatchObject({
      source: { file: 'edge.docx', page: 1, note: 'line 3' },
    });
    // No Line.text ever contains an embedded newline.
    for (const line of page!.lines) expect(line.text).not.toContain('\n');
  });
});
