import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IngestFailure, readXlsx } from '@passwerk/core';
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
});
