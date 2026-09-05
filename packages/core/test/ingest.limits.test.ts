import { DEFAULT_INGEST_LIMITS, IngestFailure, ingest, readDocx, readXlsx } from '@passwerk/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

/**
 * Issue #15: ingestion must stay bounded. A sparse workbook must not expand into a dense grid,
 * OOXML packages must not be inflated without limits, and every limit must be reported as a
 * structured `limit_exceeded` error an adapter can explain. Limits here are tiny on purpose;
 * no test allocates anything large.
 */

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const WB = `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

/** A minimal workbook with inline-string cells at the given A1 references. */
function workbook(
  cells: Record<string, string>,
  extra: Record<string, Uint8Array> = {},
): Uint8Array {
  const byRow = new Map<string, string[]>();
  for (const [ref, text] of Object.entries(cells)) {
    const row = /\d+$/.exec(ref)?.[0] ?? '1';
    const list = byRow.get(row) ?? [];
    list.push(`<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`);
    byRow.set(row, list);
  }
  const rows = [...byRow.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([r, cs]) => `<row r="${r}">${cs.join('')}</row>`)
    .join('');
  const sheet = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  return zipSync({
    'xl/workbook.xml': strToU8(WB),
    'xl/_rels/workbook.xml.rels': strToU8(RELS),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    ...extra,
  });
}

const file = (bytes: Uint8Array, name = 'sparse.xlsx') => ({ name, bytes: new Uint8Array(bytes) });
const countCells = (pages: ReturnType<typeof readXlsx>) =>
  pages.reduce((n, p) => n + p.tables.reduce((m, t) => m + t.rows.flat().length, 0), 0);

describe('sparse worksheets stay sparse', () => {
  it('a single cell at Z1000 yields one Cell, not 26,000', () => {
    const pages = readXlsx(file(workbook({ Z1000: 'Hinweis' })));
    expect(countCells(pages)).toBe(1);
    const cell = pages[0]?.tables[0]?.rows[0]?.[0];
    expect(cell).toMatchObject({ text: 'Hinweis', ref: 'Sheet1!Z1000' });
    expect(cell?.source).toEqual({ file: 'sparse.xlsx', page: 1, cell: 'Sheet1!Z1000' });
    // The line keeps the original row number so provenance still points at the sheet row.
    expect(pages[0]?.lines[0]?.source.note).toBe('line 1000');
  });
  it('empty rows and columns are dropped but every occupied cell keeps its original reference', () => {
    const pages = readXlsx(file(workbook({ B2: 'Masse', D2: '500', B9: 'Kapazität', D9: '94.5' })));
    const rows = pages[0]?.tables[0]?.rows ?? [];
    expect(rows.map((r) => r.map((c) => c.text))).toEqual([
      ['Masse', '500'],
      ['Kapazität', '94.5'],
    ]);
    expect(rows.map((r) => r.map((c) => c.ref))).toEqual([
      ['Sheet1!B2', 'Sheet1!D2'],
      ['Sheet1!B9', 'Sheet1!D9'],
    ]);
    expect(countCells(pages)).toBe(4);
  });
  it('rejects a workbook with more occupied cells than the limit', () => {
    const bytes = workbook({ A1: 'a', B1: 'b', C1: 'c' });
    expect(() => readXlsx(file(bytes), { maxCells: 2 })).toThrow(IngestFailure);
    try {
      readXlsx(file(bytes), { maxCells: 2 });
    } catch (e) {
      expect(e).toBeInstanceOf(IngestFailure);
      expect((e as IngestFailure).code).toBe('limit_exceeded');
      expect((e as IngestFailure).message).toMatch(/cells/);
    }
  });
  it('rejects a compacted grid larger than the limit (many rows x many columns)', () => {
    // Four cells on a diagonal compact to a 4 x 4 grid of 16 cells.
    const bytes = workbook({ A1: 'a', B2: 'b', C3: 'c', D4: 'd' });
    expect(() => readXlsx(file(bytes), { maxGridCells: 15 })).toThrow(/grid/);
    expect(countCells(readXlsx(file(bytes), { maxGridCells: 16 }))).toBe(16);
  });
  it('out-of-range or malformed coordinates are a corrupt file, not a loop', () => {
    for (const ref of ['A0', 'XFE1', 'A1048577']) {
      expect(() => readXlsx(file(workbook({ [ref]: 'x' })))).toThrow(IngestFailure);
    }
  });
});

describe('OOXML packages are inflated within limits', () => {
  it('reports the limit through ingest() as a structured error', async () => {
    const bundle = await ingest([file(workbook({ A1: 'a', B1: 'b' }))], {
      limits: { maxCells: 1 },
    });
    expect(bundle.documents[0]?.error).toEqual({
      code: 'limit_exceeded',
      message: expect.stringMatching(/cells/),
    });
    expect(bundle.documents[0]?.pages).toEqual([]);
  });
  it('rejects an input larger than maxInputBytes before unzipping', () => {
    const bytes = workbook({ A1: 'a' });
    expect(() => readXlsx(file(bytes), { maxInputBytes: bytes.length - 1 })).toThrow(/bytes/);
    expect(() => readXlsx(file(bytes), { maxInputBytes: bytes.length })).not.toThrow();
  });
  it('rejects an archive with more entries than maxArchiveEntries', () => {
    const bytes = workbook({ A1: 'a' }); // three entries
    expect(() => readXlsx(file(bytes), { maxArchiveEntries: 2 })).toThrow(/entries/);
    expect(() => readXlsx(file(bytes), { maxArchiveEntries: 3 })).not.toThrow();
  });
  it('rejects XML parts whose declared inflated size exceeds maxExpandedBytes', () => {
    const bytes = workbook({ A1: 'a' });
    expect(() => readXlsx(file(bytes), { maxExpandedBytes: 200 })).toThrow(/inflated/);
  });
  it('does not inflate irrelevant media just to read the XML parts', () => {
    // 200 KiB of compressible zeros as an "image": far above the expanded-bytes limit below,
    // which only the XML parts have to fit.
    const media = new Uint8Array(200 * 1024);
    const bytes = workbook({ A1: 'a' }, { 'xl/media/image1.png': media });
    const pages = readXlsx(file(bytes), { maxExpandedBytes: 8 * 1024 });
    expect(pages[0]?.tables[0]?.rows[0]?.[0]?.text).toBe('a');
  });
  it('the DOCX reader shares the same bounds', () => {
    const doc = zipSync({
      'word/document.xml': strToU8(
        `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hallo</w:t></w:r></w:p></w:body></w:document>`,
      ),
    });
    expect(() => readDocx(file(doc, 'a.docx'), { maxExpandedBytes: 10 })).toThrow(/inflated/);
    expect(readDocx(file(doc, 'a.docx'))[0]?.lines[0]?.text).toBe('Hallo');
  });
  it('defaults are generous enough for real supplier files and are exported for adapters', () => {
    expect(DEFAULT_INGEST_LIMITS.maxInputBytes).toBeGreaterThanOrEqual(16 * 1024 * 1024);
    expect(DEFAULT_INGEST_LIMITS.maxCells).toBeGreaterThanOrEqual(100_000);
    expect(DEFAULT_INGEST_LIMITS.maxArchiveEntries).toBeGreaterThanOrEqual(100);
  });
});
