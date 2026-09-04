import { readTxt } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('txt reader', () => {
  it('splits lines and column-like segments', () => {
    const bytes = new TextEncoder().encode(
      'Nennkapazität:   94,5 Ah\r\nHersteller:\tMusterwerk GmbH\n\n',
    );
    const [page] = readTxt({ name: 'notes.txt', bytes });
    expect(page!.lines).toHaveLength(2);
    expect(page!.lines[0]).toMatchObject({
      text: 'Nennkapazität:   94,5 Ah',
      segments: ['Nennkapazität:', '94,5 Ah'],
      source: { file: 'notes.txt', page: 1, note: 'line 1' },
    });
    expect(page!.lines[1]!.segments).toEqual(['Hersteller:', 'Musterwerk GmbH']);
    expect(page!.lang).toBe('de');
  });
});
