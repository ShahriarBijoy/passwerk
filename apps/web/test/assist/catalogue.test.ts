import { attributes, getAttributesForCategory } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';
import { buildCatalogue, HINT_MAX } from '../../src/workflow/assist/catalogue.ts';

describe('buildCatalogue', () => {
  it('leaves out attributes the category does not display', () => {
    const hidden = attributes.filter((a) => a.applicability.EV.status === 'not_displayed');
    expect(hidden.length).toBeGreaterThan(0); // guard: the case exists in the knowledge base
    const ids = new Set(buildCatalogue('EV').map((e) => e.id));
    for (const a of hidden) expect(ids.has(a.id)).toBe(false);
  });

  it('offers exactly the attributes the reviewer can enter a value for', () => {
    // The same set as the AddValueDialog picker (`attributeChoices`). The model must not be
    // able to name something the acceptance dialog then cannot select.
    for (const category of ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'] as const) {
      const expected = getAttributesForCategory(category, [
        'mandatory',
        'conditional',
        'optional',
      ]).map((a) => a.id);
      expect(
        buildCatalogue(category)
          .map((e) => e.id)
          .sort(),
      ).toEqual([...expected].sort());
    }
  });

  it('is sorted by attribute id, by code point', () => {
    const ids = buildCatalogue('LMT').map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('carries both languages, the value kind and the unit for every entry', () => {
    for (const e of buildCatalogue('EV')) {
      expect(e.name.de.length).toBeGreaterThan(0);
      expect(e.name.en.length).toBeGreaterThan(0);
      expect(e.valueKind.length).toBeGreaterThan(0);
      expect(Object.hasOwn(e, 'unit')).toBe(true);
    }
  });

  it('trims the hint to one bounded line', () => {
    for (const e of buildCatalogue('EV')) {
      expect(e.hint.length).toBeLessThanOrEqual(HINT_MAX);
      expect(e.hint).not.toMatch(/[\r\n]/);
    }
  });

  it('shortens a long explanation with an ellipsis rather than cutting a word in half', () => {
    const long = buildCatalogue('EV').filter((e) => e.hint.endsWith('…'));
    expect(long.length).toBeGreaterThan(0);
    for (const e of long) expect(e.hint).not.toMatch(/\s…$/);
  });
});
