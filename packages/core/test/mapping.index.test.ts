import { entriesFor, normalizeLabel, synonymIndex } from '@passwerk/core';
import { attributes, getTemplateElement } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

/** The same camelCase split synonymIndex.ts uses for its 'id' entries. */
function splitId(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

describe('synonymIndex', () => {
  it('has name, synonym, concept and id entries for every attribute, normalised', () => {
    const index = synonymIndex();
    // Ruling 2: for these attributes the split id coincides with a name, synonym or template
    // concept key (ids in this KB are largely camelCased English names, some synonym lists spell
    // that same phrase out too, e.g. warrantyPeriod / "warranty period", and some template
    // concepts do, e.g. sparePartSources / "Spare part sources"), so dedupe keeps that
    // higher-weight entry and no separate `id` entry survives. Derived from the same KB inputs
    // synonymIndex.ts itself reads (not a hard-coded id list), so this self-adjusts when the KB
    // changes; see the report for the computed set at the time of writing.
    const idNameCollision = new Set(
      attributes
        .filter((a) => {
          const idKey = normalizeLabel(splitId(a.id));
          const conceptKeys = a.templatePaths.flatMap((path) => {
            const concept = getTemplateElement(path)?.concept;
            if (!concept) return [];
            return [
              concept.preferredName['de'],
              concept.preferredName['en'],
              concept.shortName['de'],
              concept.shortName['en'],
            ];
          });
          const otherKeys = [
            a.name.en,
            a.name.de,
            ...a.synonyms.en,
            ...a.synonyms.de,
            ...conceptKeys,
          ]
            .filter((t): t is string => Boolean(t))
            .map(normalizeLabel);
          return otherKeys.includes(idKey);
        })
        .map((a) => a.id),
    );
    for (const a of attributes) {
      const mine = entriesFor(a.id);
      expect(
        mine.some((e) => e.origin === 'name' && e.weight === 1),
        a.id,
      ).toBe(true);
      expect(
        mine.some((e) => e.origin === 'synonym' && e.weight === 0.95),
        a.id,
      ).toBe(true);
      if (idNameCollision.has(a.id)) {
        expect(
          mine.some((e) => (e.origin === 'id' || e.origin === 'name') && e.weight >= 0.7),
          a.id,
        ).toBe(true);
      } else {
        expect(
          mine.some((e) => e.origin === 'id' && e.weight === 0.7),
          a.id,
        ).toBe(true);
      }
      for (const e of mine) expect(e.key, `${a.id} ${e.text}`).toBe(e.key.toLowerCase().trim());
    }
    expect(index.length).toBeGreaterThan(attributes.length * 4);
  });
  it('the id entry splits camel case', () => {
    expect(entriesFor('recycledCobaltPostConsumer').find((e) => e.origin === 'id')?.key).toBe(
      'recycled cobalt post consumer',
    );
  });
  it('is memoised', () => {
    expect(synonymIndex()).toBe(synonymIndex());
  });
});
