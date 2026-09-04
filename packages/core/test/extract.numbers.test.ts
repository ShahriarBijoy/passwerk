import { parseNumber } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('parseNumber', () => {
  it.each([
    ['94,5', 'de', '94.5', 'decimal'],
    ['1.234,56', 'de', '1234.56', 'decimal'],
    ['1,234.56', 'en', '1234.56', 'decimal'],
    ['1 234,5', 'de', '1234.5', 'decimal'],
    ['48.250', 'de', '48250', 'integer'],
    ['48.250', 'en', '48.250', 'decimal'],
    ['1,234', 'en', '1234', 'integer'],
    ['1,234', 'de', '1.234', 'decimal'],
    ['3000', 'de', '3000', 'integer'],
    ['-20', 'en', '-20', 'integer'],
    ['+12.5', 'en', '12.5', 'decimal'],
    ['0.0125', 'de', '0.0125', 'decimal'],
    ['12.5', 'de', '12.5', 'decimal'],
  ] as const)('%s (%s) -> %s %s', (raw, lang, value, kind) => {
    expect(parseNumber(raw, lang)).toEqual({ value, kind });
  });
  it.each(['abc', '', '1.2.3,4', 'MW-EV-2026'])('rejects %s', (raw) => {
    expect(parseNumber(raw, 'de')).toBeUndefined();
  });
});
