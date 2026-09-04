import { linesFromItems, tablesFromLines } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const item = (str: string, x: number, y: number, width = str.length * 5, height = 11) => ({
  str,
  x,
  y,
  width,
  height,
});

describe('pdf layout', () => {
  it('clusters items into lines by y and orders by x; whitespace items are gaps', () => {
    const lines = linesFromItems([
      item('94,5 Ah', 300, 764),
      item(' ', 123, 764, 177),
      item('Nennkapazität:', 50, 764),
      item('Titel', 50, 800),
    ]);
    expect(lines.map((l) => l.segments.map((s) => s.text))).toEqual([
      ['Titel'],
      ['Nennkapazität:', '94,5 Ah'],
    ]);
  });
  it('merges adjacent items into one segment when the gap is small', () => {
    const lines = linesFromItems([item('Musterwerk', 300, 700, 50), item('GmbH', 353, 700, 20)]);
    expect(lines[0]!.segments.map((s) => s.text)).toEqual(['Musterwerk GmbH']);
  });
  it('finds a table from consecutive aligned multi-segment lines', () => {
    const lines = linesFromItems([
      item('Rezyklatanteil', 50, 500),
      item('Post-Consumer', 220, 500),
      item('Pre-Consumer', 390, 500),
      item('Kobalt', 50, 482),
      item('12,5 %', 220, 482),
      item('4,0 %', 390, 482),
      item('Lithium', 50, 464),
      item('6,0 %', 220, 464),
      item('2,5 %', 390, 464),
      item('Fußzeile', 50, 420),
    ]);
    expect(tablesFromLines(lines)).toEqual([{ start: 0, end: 2, columns: [50, 220, 390] }]);
  });
  it('a two-segment key-value run is a table too (extract prefers the kv fact)', () => {
    const lines = linesFromItems([
      item('A:', 50, 100),
      item('1', 300, 100),
      item('B:', 50, 82),
      item('2', 300, 82),
    ]);
    expect(tablesFromLines(lines)).toHaveLength(1);
  });
});
