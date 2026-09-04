import { parseDate } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('parseDate', () => {
  it.each([
    ['10.02.2026', '2026-02-10'],
    ['2026-02-10', '2026-02-10'],
    ['1. März 2026', '2026-03-01'],
    ['3 March 2026', '2026-03-03'],
    ['March 3, 2026', '2026-03-03'],
    ['2026-02-10T08:00:00Z', '2026-02-10'],
  ])('%s -> %s', (raw, iso) => {
    expect(parseDate(raw)).toBe(iso);
  });
  it.each(['02/10/2026', '10.2.26', 'gestern', '31.02.2026', ''])('rejects %s', (raw) => {
    expect(parseDate(raw)).toBeUndefined();
  });
});
