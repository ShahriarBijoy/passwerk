import {
  applyMappings,
  extractFacts,
  ingest,
  newDraft,
  type PassportMeta,
  suggestMappings,
} from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';
import { setPath } from '../src/mapping/apply.js';

/**
 * Regressions for the post-Phase-5 review of the mapping layer (issues #9, #10, #13, #14).
 * Every test here runs the real pipeline (ingest -> extractFacts -> suggestMappings ->
 * applyMappings) or the real applyMappings on a real draft; nothing is mocked.
 */

const meta: PassportMeta = {
  schemaVersion: '1.0',
  category: 'EV',
  createdAt: '2026-09-05T10:00:00Z',
  passportId: 'https://passport.musterwerk.example/battery/MW-EV-2026-000123',
};

const csv = (name: string, text: string) => ({ name, bytes: new TextEncoder().encode(text) });

async function factsOf(text: string, name = 'in.csv') {
  const bundle = await ingest([csv(name, text)]);
  return extractFacts(bundle);
}

function factByLabel(set: Awaited<ReturnType<typeof factsOf>>, label: string) {
  const f = set.facts.find((x) => x.label === label);
  if (!f) throw new Error(`no fact labelled ${label}: ${set.facts.map((x) => x.label).join(', ')}`);
  return f;
}

describe('#9 units written into labels keep their conversion factor', () => {
  it('pair table: [g] and [mAh] in the label convert the value once and keep the raw unit', async () => {
    const set = await factsOf('Battery mass [g];500\nRated capacity [mAh];5000\n');
    expect(factByLabel(set, 'Battery mass [g]')).toMatchObject({
      value: '0.5',
      unit: 'kg',
      rawUnit: 'g',
    });
    expect(factByLabel(set, 'Rated capacity [mAh]')).toMatchObject({
      value: '5',
      unit: 'Ah',
      rawUnit: 'mAh',
    });
  });
  it('pair table: [mV], [Wh] and [h] in the label convert too', async () => {
    const set = await factsOf('Nennspannung [mV];3700\nNennenergie [Wh];5000\nLadezeit [h];2\n');
    expect(factByLabel(set, 'Nennspannung [mV]')).toMatchObject({
      value: '3.7',
      unit: 'V',
      rawUnit: 'mV',
    });
    expect(factByLabel(set, 'Nennenergie [Wh]')).toMatchObject({
      value: '5',
      unit: 'kWh',
      rawUnit: 'Wh',
    });
    expect(factByLabel(set, 'Ladezeit [h]')).toMatchObject({
      value: '120',
      unit: 'min',
      rawUnit: 'h',
    });
  });
  it('header-cell table: a unit in the column header converts each cell', async () => {
    const set = await factsOf('Position;Masse [g];Kapazität [mAh]\nZelle A;500;5000\n');
    const mass = set.facts.find((f) => f.label === 'Masse [g]' && f.rowLabel === 'Zelle A');
    const cap = set.facts.find((f) => f.label === 'Kapazität [mAh]' && f.rowLabel === 'Zelle A');
    expect(mass).toMatchObject({ value: '0.5', unit: 'kg', rawUnit: 'g' });
    expect(cap).toMatchObject({ value: '5', unit: 'Ah', rawUnit: 'mAh' });
  });
  it('label unit, value suffix and unit column produce identical normalised values', async () => {
    const inLabel = factByLabel(await factsOf('Battery mass [g];500\n'), 'Battery mass [g]');
    const inSuffix = factByLabel(await factsOf('Battery mass;500 g\n'), 'Battery mass');
    const inColumn = factByLabel(await factsOf('Battery mass;500;g\n'), 'Battery mass');
    for (const f of [inLabel, inSuffix, inColumn]) {
      expect(f).toMatchObject({ value: '0.5', unit: 'kg', rawUnit: 'g', kind: 'decimal' });
    }
  });
  it('a canonical unit in the label is unchanged and still a plain match', async () => {
    const set = await factsOf('Battery mass [kg];500\n');
    expect(factByLabel(set, 'Battery mass [kg]')).toMatchObject({
      value: '500',
      unit: 'kg',
      rawUnit: 'kg',
    });
    const [p] = suggestMappings(set).filter((x) => x.attributeId === 'batteryMass');
    expect(p?.checks.unit).toBe('match');
  });
  it('the proposal reports the conversion and carries the converted value', async () => {
    const set = await factsOf('Battery mass [g];500\nRated capacity [mAh];5000\n');
    const proposals = suggestMappings(set);
    const mass = proposals.find((p) => p.attributeId === 'batteryMass');
    const cap = proposals.find((p) => p.attributeId === 'ratedCapacity');
    expect(mass).toMatchObject({ value: '0.5', unit: 'kg', checks: { unit: 'converted' } });
    expect(cap).toMatchObject({ value: '5', unit: 'Ah', checks: { unit: 'converted' } });
  });
});

describe('#10 composite paths cannot reach the prototype chain', () => {
  const unsafe = [
    '__proto__.passwerkReviewCanary',
    'constructor.prototype.passwerkReviewCanary',
    'name.__proto__.passwerkReviewCanary',
    'prototype.x',
  ];
  for (const path of unsafe) {
    it(`rejects ${path} without touching Object.prototype or the draft`, () => {
      const draft = newDraft(meta);
      try {
        expect(() =>
          applyMappings(draft, [{ attributeId: 'manufacturerInformation', path, value: true }]),
        ).toThrow(/path/);
        expect(({} as Record<string, unknown>)['passwerkReviewCanary']).toBeUndefined();
        expect(({} as Record<string, unknown>)['x']).toBeUndefined();
        expect(draft.attributes).toEqual({});
      } finally {
        delete (Object.prototype as Record<string, unknown>)['passwerkReviewCanary'];
        delete (Object.prototype as Record<string, unknown>)['x'];
      }
    });
  }
  it('a direct setPath call is protected too, not only the applyMappings entry point', () => {
    try {
      expect(() => setPath({}, '__proto__.passwerkReviewCanary', true)).toThrow(/path/);
      expect(() => setPath({}, 'constructor.prototype.passwerkReviewCanary', true)).toThrow(/path/);
      expect(({} as Record<string, unknown>)['passwerkReviewCanary']).toBeUndefined();
    } finally {
      delete (Object.prototype as Record<string, unknown>)['passwerkReviewCanary'];
    }
    // Inherited properties are never traversed: an own "toString" key is created, not reused.
    expect(setPath({}, 'toString.x', 1)).toEqual({ toString: { x: 1 } });
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });
  it('rejects empty segments and an empty path', () => {
    for (const path of ['', '.name', 'name.', 'name..de']) {
      expect(() =>
        applyMappings(newDraft(meta), [
          { attributeId: 'manufacturerInformation', path, value: 'x' },
        ]),
      ).toThrow(/path/);
    }
  });
  it('rejects a path the composite shape does not have', () => {
    expect(() =>
      applyMappings(newDraft(meta), [
        { attributeId: 'manufacturerInformation', path: 'bogus.field', value: 'x' },
      ]),
    ).toThrow(/bogus/);
  });
  it('still accepts language-map keys and nested address fields', () => {
    const r = applyMappings(newDraft(meta), [
      { attributeId: 'manufacturerInformation', path: 'name.de', value: 'Musterwerk GmbH' },
      { attributeId: 'manufacturerInformation', path: 'name.en', value: 'Musterwerk Ltd' },
      { attributeId: 'manufacturerInformation', path: 'address.cityTown', value: 'Bremen' },
    ]);
    expect(r.conflicts).toEqual([]);
    expect(r.draft.attributes['manufacturerInformation']?.value).toEqual({
      name: { de: 'Musterwerk GmbH', en: 'Musterwerk Ltd' },
      address: { cityTown: 'Bremen' },
    });
  });
});

describe('#13 two documents disagreeing on the same composite leaf need an explicit override', () => {
  const a = {
    attributeId: 'manufacturerInformation',
    path: 'name.en',
    value: 'Supplier A',
    source: [{ file: 'a.txt' }],
  };
  const b = {
    attributeId: 'manufacturerInformation',
    path: 'name.en',
    value: 'Supplier B',
    source: [{ file: 'b.txt' }],
  };
  it('records a conflict with the path and keeps the first value', () => {
    const r = applyMappings(newDraft(meta), [a, b]);
    expect(r.applied).toBe(1);
    expect(r.conflicts).toEqual([
      {
        attributeId: 'manufacturerInformation',
        path: 'name.en',
        existing: 'Supplier A',
        incoming: 'Supplier B',
        source: [{ file: 'b.txt' }],
      },
    ]);
    const field = r.draft.attributes['manufacturerInformation'];
    expect(field?.status).toBe('conflict');
    expect(field?.value).toEqual({ name: { en: 'Supplier A' } });
    expect(field?.source).toEqual([{ file: 'a.txt' }, { file: 'b.txt' }]);
  });
  it('reversing the document order never silently picks a winner', () => {
    const r = applyMappings(newDraft(meta), [b, a]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.draft.attributes['manufacturerInformation']?.value).toEqual({
      name: { en: 'Supplier B' },
    });
    expect(r.draft.attributes['manufacturerInformation']?.status).toBe('conflict');
  });
  it('override: true replaces the leaf and restores present', () => {
    const conflicted = applyMappings(newDraft(meta), [a, b]);
    const r = applyMappings(conflicted.draft, [{ ...b, override: true }]);
    expect(r.conflicts).toEqual([]);
    expect(r.applied).toBe(1);
    expect(r.draft.attributes['manufacturerInformation']).toMatchObject({
      status: 'present',
      value: { name: { en: 'Supplier B' } },
    });
  });
  it('a different leaf still merges incrementally, even while another leaf is in conflict', () => {
    const conflicted = applyMappings(newDraft(meta), [a, b]);
    const r = applyMappings(conflicted.draft, [
      { attributeId: 'manufacturerInformation', path: 'identifier', value: 'DE-MW-0001' },
    ]);
    expect(r.conflicts).toEqual([]);
    expect(r.applied).toBe(1);
    expect(r.draft.attributes['manufacturerInformation']?.value).toEqual({
      name: { en: 'Supplier A' },
      identifier: 'DE-MW-0001',
    });
    // The unresolved leaf is still unresolved.
    expect(r.draft.attributes['manufacturerInformation']?.status).toBe('conflict');
  });
  it('an identical repeated leaf stays idempotent', () => {
    const once = applyMappings(newDraft(meta), [a]);
    const twice = applyMappings(once.draft, [a]);
    expect(twice.applied).toBe(0);
    expect(twice.conflicts).toEqual([]);
    expect(twice.draft.attributes['manufacturerInformation']?.status).toBe('present');
  });
});

describe('#14 proposals use the knowledge-base range (D-021)', () => {
  const cases: [string, string, string][] = [
    ['internalResistanceIncrease', 'Widerstandszunahme [%];150', '150'],
    ['evolutionOfSelfDischarge', 'Selbstentladungsentwicklung [%];150', '150'],
    ['carbonFootprintShareEndOfLife', 'Recyclinggutschrift [%];-10', '-10'],
  ];
  for (const [attributeId, line, value] of cases) {
    it(`${attributeId} = ${value} survives ingest -> extract -> suggest -> apply`, async () => {
      const set = await factsOf(`${line}\n`);
      const p = suggestMappings(set).find((x) => x.attributeId === attributeId);
      expect(p).toMatchObject({ value, checks: { kind: 'ok' } });
      expect(p?.confidence ?? 0).toBeGreaterThanOrEqual(0.7);
      const r = applyMappings(newDraft(meta), [{ attributeId, value: p?.value }]);
      expect(r.applied).toBe(1);
    });
  }
  it('an out-of-range value is rejected by proposal generation and by applyMappings alike', async () => {
    const range = getAttribute('internalResistanceIncrease')?.range;
    expect(range).toEqual({ min: 0, max: 1000 });
    const set = await factsOf('Widerstandszunahme [%];1001\n');
    expect(
      suggestMappings(set).find((x) => x.attributeId === 'internalResistanceIncrease'),
    ).toBeUndefined();
    expect(() =>
      applyMappings(newDraft(meta), [{ attributeId: 'internalResistanceIncrease', value: '1001' }]),
    ).toThrow(/internalResistanceIncrease/);
  });
  it('boundary values are accepted', async () => {
    const set = await factsOf('Widerstandszunahme [%];1000\nRecyclinggutschrift [%];-100\n');
    const ids = suggestMappings(set).map((p) => p.attributeId);
    expect(ids).toContain('internalResistanceIncrease');
    expect(ids).toContain('carbonFootprintShareEndOfLife');
  });
});
