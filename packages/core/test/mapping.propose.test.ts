import { type FactSet, proposalValue, suggestMappings } from '@passwerk/core';
import type { Attribute } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const facts = (list: Partial<FactSet['facts'][number]>[]): FactSet => ({
  facts: list.map((f, i) => ({
    id: `f#1:${i + 1}`,
    label: 'x',
    labelKey: 'x',
    raw: '',
    kind: 'text',
    lang: 'de',
    shape: 'kv',
    source: { file: 'f.pdf', page: 1, note: `line ${i + 1}` },
    ...f,
  })),
  tables: [],
  documents: [],
});

describe('suggestMappings', () => {
  it('proposes ratedCapacity for "Nennkapazität: 94,5 Ah" with full confidence and a DE/EN why', () => {
    const [p] = suggestMappings(
      facts([
        {
          label: 'Nennkapazität:',
          labelKey: 'nennkapazitaet',
          raw: '94,5 Ah',
          value: '94.5',
          kind: 'decimal',
          unit: 'Ah',
          rawUnit: 'Ah',
        },
      ]),
    );
    expect(p).toMatchObject({
      attributeId: 'ratedCapacity',
      value: '94.5',
      unit: 'Ah',
      confidence: 1,
      factId: 'f#1:1',
      source: [{ file: 'f.pdf', page: 1, note: 'line 1' }],
      checks: { label: 1, unit: 'match', kind: 'ok' },
    });
    expect(p!.why.de).toContain('Nennkapazität');
    expect(p!.why.en).toContain('unit matches');
  });
  it('a wrong unit caps confidence', () => {
    const [p] = suggestMappings(
      facts([
        {
          label: 'Nennkapazität',
          labelKey: 'nennkapazitaet',
          value: '94.5',
          kind: 'decimal',
          unit: 'V',
        },
      ]),
    );
    expect(p!.attributeId).toBe('ratedCapacity');
    expect(p!.confidence).toBeCloseTo(0.3);
  });
  it('sorts by confidence, then attributeId, then factId, and drops below minConfidence', () => {
    const list = suggestMappings(
      facts([{ label: 'Masse', labelKey: 'masse', value: '412.7', kind: 'decimal', unit: 'kg' }]),
      { minConfidence: 0.3 },
    );
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i += 1) {
      const a = list[i - 1]!;
      const b = list[i]!;
      expect(
        a.confidence > b.confidence ||
          (a.confidence === b.confidence && a.attributeId <= b.attributeId),
      ).toBe(true);
    }
    expect(list.every((p) => p.confidence >= 0.3)).toBe(true);
  });
  it('sort tie-breaks are plain code-point order, not locale collation', () => {
    // Same attribute, equal confidence: factId tie-break must sort 'f#1:1' before 'f#1:2'
    // even though the facts are given with id 'f#1:2' first.
    const sameAttribute = suggestMappings(
      facts([
        {
          id: 'f#1:2',
          label: 'Masse',
          labelKey: 'masse',
          value: '412.7',
          kind: 'decimal',
          unit: 'kg',
        },
        {
          id: 'f#1:1',
          label: 'Masse',
          labelKey: 'masse',
          value: '412.7',
          kind: 'decimal',
          unit: 'kg',
        },
      ]),
    );
    const mass = sameAttribute.filter((p) => p.attributeId === 'batteryMass');
    expect(mass).toHaveLength(2);
    expect(mass[0]!.confidence).toBe(mass[1]!.confidence);
    expect(mass[0]!.factId).toBe('f#1:1');
    expect(mass[1]!.factId).toBe('f#1:2');

    // Different attributes, equal confidence: attributeId tie-break sorts ascending
    // ('manufacturingDate' before 'ratedCapacity').
    const differentAttributes = suggestMappings(
      facts([
        {
          label: 'Nennkapazität',
          labelKey: 'nennkapazitaet',
          value: '94.5',
          kind: 'decimal',
          unit: 'Ah',
        },
        {
          label: 'Herstellungsdatum',
          labelKey: 'herstellungsdatum',
          value: '2026-02-10',
          kind: 'date',
        },
      ]),
    );
    const capacityIndex = differentAttributes.findIndex((p) => p.attributeId === 'ratedCapacity');
    const dateIndex = differentAttributes.findIndex((p) => p.attributeId === 'manufacturingDate');
    expect(capacityIndex).toBeGreaterThanOrEqual(0);
    expect(dateIndex).toBeGreaterThanOrEqual(0);
    expect(differentAttributes[capacityIndex]!.confidence).toBe(1);
    expect(differentAttributes[dateIndex]!.confidence).toBe(1);
    expect(dateIndex).toBeLessThan(capacityIndex);
  });
  it('composites: manufacturer name lands in name.<lang>, chemistry in shortName', () => {
    const list = suggestMappings(
      facts([
        {
          label: 'Hersteller:',
          labelKey: 'hersteller',
          value: 'Musterwerk GmbH',
          kind: 'text',
          lang: 'de',
        },
        { label: 'Zellchemie:', labelKey: 'zellchemie', value: 'NMC811', kind: 'text' },
      ]),
    );
    expect(list.find((p) => p.attributeId === 'manufacturerInformation')).toMatchObject({
      path: 'name.de',
      value: 'Musterwerk GmbH',
    });
    expect(list.find((p) => p.attributeId === 'batteryChemistry')).toMatchObject({
      path: 'shortName',
      value: 'NMC811',
    });
  });
  it('never proposes document or graphic attributes and never other composites', () => {
    const list = suggestMappings(
      facts([
        {
          label: 'Demontageanleitung',
          labelKey: 'demontageanleitung',
          value: 'siehe Anhang',
          kind: 'text',
        },
        { label: 'Gefahrstoffe', labelKey: 'gefahrstoffe', value: 'Blei', kind: 'text' },
      ]),
    );
    expect(list.map((p) => p.attributeId)).not.toContain('dismantlingInformation');
    expect(list.map((p) => p.attributeId)).not.toContain('hazardousSubstances');
  });
  it('value shapes follow the attribute valueKind', () => {
    const list = suggestMappings(
      facts([
        {
          label: 'Herstellungsdatum',
          labelKey: 'herstellungsdatum',
          value: '2026-02-10',
          kind: 'date',
        },
        {
          label: 'Anzahl Vollzyklen',
          labelKey: 'anzahl vollzyklen',
          value: '142',
          kind: 'integer',
          unit: 'cycles',
        },
      ]),
    );
    expect(list.find((p) => p.attributeId === 'manufacturingDate')!.value).toBe('2026-02-10');
    expect(list.find((p) => p.attributeId === 'numberOfFullCycles')!.value).toBe('142');
  });
  it('category filter drops attributes not displayed for the category', async () => {
    const all = suggestMappings(
      facts([
        { label: 'Ladezustand', labelKey: 'ladezustand', value: '68', kind: 'integer', unit: '%' },
      ]),
    );
    expect(all.some((p) => p.attributeId === 'stateOfCharge')).toBe(true);
    const filtered = suggestMappings(
      facts([
        { label: 'Ladezustand', labelKey: 'ladezustand', value: '68', kind: 'integer', unit: '%' },
      ]),
      { category: 'INDUSTRIAL_GT_2KWH' },
    );
    // stateOfCharge applicability for INDUSTRIAL is taken from the KB; assert consistency, not a hard-coded status
    const soc = (await import('@passwerk/rules')).getAttribute('stateOfCharge')!;
    expect(filtered.some((p) => p.attributeId === 'stateOfCharge')).toBe(
      soc.applicability.INDUSTRIAL_GT_2KWH.status !== 'not_displayed',
    );
  });
  it('never proposes a value the attribute schema would reject', () => {
    const cases: { label: string; labelKey: string; raw: string; attributeId: string }[] = [
      {
        label: 'Batteriemasse',
        labelKey: 'batteriemasse',
        raw: 'unbekannt',
        attributeId: 'batteryMass',
      },
      {
        label: 'Nennkapazität',
        labelKey: 'nennkapazitaet',
        raw: 'siehe Anhang',
        attributeId: 'ratedCapacity',
      },
      {
        label: 'Herstellungsdatum',
        labelKey: 'herstellungsdatum',
        raw: 'offen',
        attributeId: 'manufacturingDate',
      },
    ];
    for (const c of cases) {
      const list = suggestMappings(
        facts([{ label: c.label, labelKey: c.labelKey, raw: c.raw, value: c.raw, kind: 'text' }]),
        { minConfidence: 0 },
      );
      expect(
        list.find((p) => p.attributeId === c.attributeId),
        `${c.attributeId} from "${c.raw}"`,
      ).toBeUndefined();
    }
  });
  it('proposalValue rejects a boolean shape unless the fact was extracted as a boolean', () => {
    const booleanAttribute = { id: 'testBoolean', valueKind: 'boolean' } as unknown as Attribute;
    const fact = (kind: FactSet['facts'][number]['kind'], value: string) =>
      facts([{ label: 'x', labelKey: 'x', raw: value, value, kind }]).facts[0]!;
    expect(proposalValue(booleanAttribute, fact('text', 'vielleicht'))).toBeUndefined();
    expect(proposalValue(booleanAttribute, fact('boolean', 'true'))).toEqual({ value: true });
  });
});
