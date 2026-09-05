import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IngestFailure, readXlsx } from '@passwerk/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const FIX = join(import.meta.dirname, 'fixtures');
const file = (dir: string, name: string) => ({
  name,
  bytes: new Uint8Array(readFileSync(join(FIX, dir, name))),
});

describe('xlsx reader', () => {
  const pages = readXlsx(file('musterwerk', 'stueckliste.xlsx'));
  it('one page per sheet, in workbook order, titled by sheet name', () => {
    expect(pages.map((p) => [p.number, p.title])).toEqual([
      [1, 'Stammdaten'],
      [2, 'Stückliste'],
      [3, 'Leistung'],
    ]);
  });
  it('shared strings, inline strings, numbers and date serials', () => {
    const rows = pages[0]!.tables[0]!.rows;
    expect(rows[0]![0]).toMatchObject({
      text: 'Batteriepass-ID',
      ref: 'Stammdaten!A1',
      kind: 'text',
    });
    expect(rows[0]![1]!.text).toBe('https://passport.musterwerk.example/battery/MW-EV-2026-000123');
    expect(rows[3]![1]).toMatchObject({
      text: '33.6',
      kind: 'number',
      source: { file: 'stueckliste.xlsx', page: 1, cell: 'Stammdaten!B4' },
    });
    expect(rows[7]![1]).toMatchObject({ text: '2026-03-01', kind: 'date' });
  });
  it('BOM sheet keeps the header row and numeric cells', () => {
    const rows = pages[1]!.tables[0]!.rows;
    expect(rows[0]!.map((c) => c.text)).toEqual([
      'Material',
      'CAS-Nr.',
      'Masse [kg]',
      'Kobalt rec. %',
    ]);
    expect(rows[1]![3]).toMatchObject({ text: '12.5', kind: 'number', ref: 'Stückliste!D2' });
  });
  it('lines mirror the rows', () => {
    expect(pages[2]!.lines[1]).toMatchObject({
      segments: ['Ladezustand', '68', '%'],
      source: { file: 'stueckliste.xlsx', page: 3, note: 'line 2' },
    });
  });
  it('detects German', () => {
    expect(pages[1]!.lang).toBe('de');
  });
  it('a truncated file is reported as corrupt', () => {
    expect(() => readXlsx(file('edge', 'truncated.xlsx'))).toThrow(IngestFailure);
  });
  it('an error cell, a boolean cell and a gap cell are read with the right kind', () => {
    const workbookXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Edge" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const relsXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
    // A1: error cell, B1: boolean cell, C1: no <c> element at all (a gap), D1: present. Column
    // C is empty in every row, so the sparse reader drops it (issue #15) and D1 follows B1
    // directly while keeping its own reference. A gap cell only survives when its column is
    // occupied somewhere else in the sheet (see ingest.limits.test.ts).
    const sheetXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="e"><v>#DIV/0!</v></c><c r="B1" t="b"><v>1</v></c><c r="D1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>';
    const bytes = zipSync({
      'xl/workbook.xml': strToU8(workbookXml),
      'xl/_rels/workbook.xml.rels': strToU8(relsXml),
      'xl/worksheets/sheet1.xml': strToU8(sheetXml),
    });
    const [page] = readXlsx({ name: 'edge.xlsx', bytes });
    const row = page!.tables[0]!.rows[0]!;
    expect(row[0]).toMatchObject({ text: '#DIV/0!', kind: 'text' });
    expect(row[1]).toMatchObject({ text: 'true', kind: 'boolean' });
    expect(row[2]).toMatchObject({ text: 'x', kind: 'text', ref: 'Edge!D1' });
    expect(row).toHaveLength(3);
  });
});
