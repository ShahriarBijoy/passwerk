import { describe, expect, it } from 'vitest';
import { de } from '@/i18n/de.ts';
import { en } from '@/i18n/en.ts';
import { t } from '@/i18n/index.ts';

describe('i18n dictionary', () => {
  it('de and en have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });
  it('has no empty strings', () => {
    for (const dict of [de, en])
      for (const [k, v] of Object.entries(dict)) expect(v, k).not.toBe('');
  });
  it('substitutes params', () => {
    expect(t('en', 'review.summary', { accepted: 3, pending: 2 })).toBe('3 accepted, 2 pending');
    expect(t('de', 'review.page', { page: 4 })).toBe('Seite 4');
  });
});
