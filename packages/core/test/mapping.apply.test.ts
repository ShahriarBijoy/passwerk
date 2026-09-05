import { applyMappings, newDraft, type PassportMeta, validateSchema } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const meta: PassportMeta = {
  schemaVersion: '1.0',
  category: 'EV',
  createdAt: '2026-09-04T10:00:00Z',
  passportId: 'https://passport.musterwerk.example/battery/MW-EV-2026-000123',
};
const src = (note: string) => [{ file: 'f.pdf', page: 1, note }];

describe('applyMappings', () => {
  it('newDraft is empty and structurally valid', () => {
    const d = newDraft(meta);
    expect(d.attributes).toEqual({});
    expect(validateSchema(d).findings).toEqual([]);
  });
  it('sets a missing field to present with value, unit, source, confidence, recordedAt', () => {
    const r = applyMappings(newDraft(meta), [
      {
        attributeId: 'ratedCapacity',
        value: '94.5',
        unit: 'Ah',
        source: src('line 6'),
        confidence: 1,
        recordedAt: '2026-02-10T00:00:00Z',
      },
    ]);
    expect(r.applied).toBe(1);
    expect(r.conflicts).toEqual([]);
    expect(r.draft.attributes['ratedCapacity']).toEqual({
      value: '94.5',
      unit: 'Ah',
      source: src('line 6'),
      confidence: 1,
      status: 'present',
      recordedAt: '2026-02-10T00:00:00Z',
    });
  });
  it('is pure and idempotent; the same value again merges sources', () => {
    const base = newDraft(meta);
    const once = applyMappings(base, [
      { attributeId: 'batteryMass', value: '412.7', unit: 'kg', source: src('line 10') },
    ]);
    expect(base.attributes).toEqual({});
    const twice = applyMappings(once.draft, [
      {
        attributeId: 'batteryMass',
        value: '412.7',
        unit: 'kg',
        source: [{ file: 's.xlsx', cell: 'Stammdaten!B5' }],
      },
    ]);
    expect(twice.conflicts).toEqual([]);
    expect(twice.draft.attributes['batteryMass']?.source).toEqual([
      ...src('line 10'),
      { file: 's.xlsx', cell: 'Stammdaten!B5' },
    ]);
    const thrice = applyMappings(twice.draft, [
      { attributeId: 'batteryMass', value: '412.7', unit: 'kg', source: src('line 10') },
    ]);
    expect(thrice.draft).toEqual(twice.draft);
  });
  it('a different value flags a conflict and keeps the existing value unless override', () => {
    const one = applyMappings(newDraft(meta), [
      { attributeId: 'batteryMass', value: '412.7', source: src('line 10') },
    ]);
    const two = applyMappings(one.draft, [
      { attributeId: 'batteryMass', value: '410', source: [{ file: 's.xlsx', cell: 'B5' }] },
    ]);
    expect(two.conflicts).toEqual([
      {
        attributeId: 'batteryMass',
        existing: '412.7',
        incoming: '410',
        source: [{ file: 's.xlsx', cell: 'B5' }],
      },
    ]);
    expect(two.draft.attributes['batteryMass']).toMatchObject({
      value: '412.7',
      status: 'conflict',
    });
    expect(two.draft.attributes['batteryMass']?.source).toHaveLength(2);
    const three = applyMappings(two.draft, [
      {
        attributeId: 'batteryMass',
        value: '410',
        source: [{ file: 's.xlsx', cell: 'B5' }],
        override: true,
      },
    ]);
    expect(three.draft.attributes['batteryMass']).toMatchObject({
      value: '410',
      status: 'present',
    });
    expect(three.conflicts).toEqual([]);
  });
  it('path decisions build composites incrementally', () => {
    const r = applyMappings(newDraft(meta), [
      {
        attributeId: 'manufacturerInformation',
        path: 'name.de',
        value: 'Musterwerk GmbH',
        source: src('line 2'),
      },
      {
        attributeId: 'manufacturerInformation',
        path: 'identifier',
        value: 'DE-MW-0001',
        source: src('line 3'),
      },
      {
        attributeId: 'manufacturerInformation',
        path: 'address.cityTown',
        value: 'Bremen',
        source: src('line 4'),
      },
    ]);
    expect(r.draft.attributes['manufacturerInformation']?.value).toEqual({
      name: { de: 'Musterwerk GmbH' },
      identifier: 'DE-MW-0001',
      address: { cityTown: 'Bremen' },
    });
    expect(r.draft.attributes['manufacturerInformation']?.source).toHaveLength(3);
    expect(validateSchema(r.draft).findings).toEqual([]);
  });
  it('repeating an identical path decision merges sources but does not recount as applied', () => {
    const once = applyMappings(newDraft(meta), [
      {
        attributeId: 'manufacturerInformation',
        path: 'name.de',
        value: 'Musterwerk GmbH',
        source: src('line 2'),
      },
    ]);
    expect(once.applied).toBe(1);
    const twice = applyMappings(once.draft, [
      {
        attributeId: 'manufacturerInformation',
        path: 'name.de',
        value: 'Musterwerk GmbH',
        source: [{ file: 's.xlsx', cell: 'A1' }],
      },
    ]);
    expect(twice.applied).toBe(0);
    expect(twice.draft.attributes['manufacturerInformation']?.value).toEqual({
      name: { de: 'Musterwerk GmbH' },
    });
    expect(twice.draft.attributes['manufacturerInformation']?.source).toEqual([
      ...src('line 2'),
      { file: 's.xlsx', cell: 'A1' },
    ]);
    // A path decision that changes an already-set leaf is a conflict (#13), not an overwrite;
    // only an explicit override counts as applied.
    const changed = applyMappings(twice.draft, [
      { attributeId: 'manufacturerInformation', path: 'name.de', value: 'Other GmbH' },
    ]);
    expect(changed.applied).toBe(0);
    expect(changed.conflicts).toHaveLength(1);
    const overridden = applyMappings(twice.draft, [
      {
        attributeId: 'manufacturerInformation',
        path: 'name.de',
        value: 'Other GmbH',
        override: true,
      },
    ]);
    expect(overridden.applied).toBe(1);
  });
  it('rejects unknown attribute ids and values that fail the leaf schema', () => {
    expect(() => applyMappings(newDraft(meta), [{ attributeId: 'nope', value: 1 }])).toThrow(
      /nope/,
    );
    expect(() =>
      applyMappings(newDraft(meta), [{ attributeId: 'batteryMass', value: '12,5' }]),
    ).toThrow(/batteryMass/);
  });
  it('rejects a path decision targeting a non-composite attribute', () => {
    expect(() =>
      applyMappings(newDraft(meta), [{ attributeId: 'ratedCapacity', path: 'foo', value: '1' }]),
    ).toThrow(/ratedCapacity/);
  });
});
