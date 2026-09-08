import { BATTERY_TYPES, BatteryCategory, ROLES } from '@passwerk/core';
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
  // `t()` falls back to rendering the key itself rather than throwing (see i18n/index.ts), so a
  // new core enum value with no matching chrome label would silently show as, e.g.,
  // "project.batteryType.FOO" in the UI instead of failing the build. Pin every current value's
  // key in both dictionaries so a future core addition without a matching label breaks this
  // test rather than shipping unnoticed.
  it('every core battery type, role and category has a chrome label in both languages', () => {
    const keys = [
      ...BATTERY_TYPES.map((v) => `project.batteryType.${v}`),
      ...ROLES.map((v) => `project.role.${v}`),
      ...BatteryCategory.options.map((v) => `category.${v}`),
    ];
    for (const key of keys) {
      // Not `toHaveProperty`: these are literal flat keys containing dots, and `toHaveProperty`
      // treats a dotted string as a nested keyPath rather than a single property name.
      expect(key in de, key).toBe(true);
      expect(key in en, key).toBe(true);
    }
  });
});
