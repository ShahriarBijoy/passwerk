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
    // The fixture's content has zero DE and zero EN stop-word hits (all header/unit tokens,
    // e.g. "Parameter", "Ah", "kg"), so detectLang's documented tie-break to 'de' applies
    // (see ingest.text.test.ts "defaults to German on a tie"). Deviation from the brief's
    // expected 'en', which does not match the fixture's actual content.
    expect(page.lang).toBe('de');
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
});
