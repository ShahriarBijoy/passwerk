import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, readCsv, sniffDelimiter } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const FIX = join(import.meta.dirname, 'fixtures', 'musterwerk');
const file = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(join(FIX, name))) });

describe('csv reader', () => {
  it('sniffs the delimiter', () => {
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(sniffDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(sniffDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(sniffDelimiter('only one column')).toBe(',');
  });
  it('parses RFC 4180 quotes, escaped quotes and embedded newlines', () => {
    expect(parseCsv('a;"b;c";"d""e"\n"multi\nline";2;3', ';')).toEqual([
      ['a', 'b;c', 'd"e'],
      ['multi\nline', '2', '3'],
    ]);
  });
  it('reads the English data sheet with windows-1252 bytes and cell provenance', () => {
    const pages = readCsv(file('datasheet-en.csv'));
    expect(pages).toHaveLength(1);
    const page = pages[0]!;
    expect(page.lang).toBe('en');
    expect(page.textless).toBe(false);
    const table = page.tables[0]!;
    expect(table.rows[0]!.map((c) => c.text)).toEqual(['Parameter', 'Value', 'Unit']);
    expect(table.rows[1]![1]).toMatchObject({
      text: '94.5',
      ref: 'R2C2',
      source: { file: 'datasheet-en.csv', page: 1, cell: 'R2C2' },
    });
    expect(table.rows[6]![0]!.text).toBe('Temperature range – idle, lower');
    expect(table.rows[6]![2]!.text).toBe('°C');
    expect(page.lines[1]).toMatchObject({
      text: 'Rated capacity  94.5  Ah',
      segments: ['Rated capacity', '94.5', 'Ah'],
    });
  });
  it('an empty file yields one textless page', () => {
    const pages = readCsv({ name: 'empty.csv', bytes: new Uint8Array() });
    expect(pages[0]).toMatchObject({ textless: true, lines: [], tables: [] });
  });
  it('keeps ragged rows, short or long, with correct cell provenance', () => {
    expect(parseCsv('a;b;c\n1;2', ';')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2'],
    ]);
    const pages = readCsv({ name: 'ragged.csv', bytes: new TextEncoder().encode('a;b;c\n1;2') });
    const table = pages[0]!.tables[0]!;
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]!.map((c) => c.text)).toEqual(['a', 'b', 'c']);
    expect(table.rows[1]!).toHaveLength(2);
    expect(table.rows[1]!.map((c) => c.text)).toEqual(['1', '2']);
    expect(table.rows[1]![1]).toMatchObject({
      text: '2',
      ref: 'R2C2',
      source: { file: 'ragged.csv', page: 1, cell: 'R2C2' },
    });
  });
});
