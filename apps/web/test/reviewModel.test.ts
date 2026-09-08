import { getSample, type MappingProposal, type PassportDraft } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import {
  arrayEntries,
  attributeChoices,
  buildGroups,
  compositeLeaves,
  filterGroups,
} from '@/views/reviewModel.ts';

const p = (over: Partial<MappingProposal>): MappingProposal => ({
  attributeId: 'ratedCapacity',
  value: '1',
  factId: 'f',
  confidence: 0.8,
  source: [{ file: 'a.pdf' }],
  why: { de: 'w', en: 'w' },
  checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' },
  ...over,
});

describe('review model', () => {
  it('groups by attribute and path, sorted by part then id', () => {
    const groups = buildGroups(
      [
        p({ attributeId: 'nominalVoltage', factId: 'v' }),
        p({ factId: 'c1' }),
        p({ factId: 'c2' }),
        p({ attributeId: 'manufacturerInformation', path: 'name.de', factId: 'm' }),
      ],
      {},
    );
    expect(groups.map((g) => g.key)).toEqual([
      'manufacturerInformation#name.de',
      'nominalVoltage',
      'ratedCapacity',
    ]);
    expect(groups[2]?.proposals.map((x) => x.factId)).toEqual(['c1', 'c2']);
    expect(groups[0]?.name.de.length).toBeGreaterThan(0);
  });
  it('filters by decision state and search', () => {
    const groups = buildGroups(
      [p({ factId: 'c1' }), p({ attributeId: 'nominalVoltage', factId: 'v' })],
      {
        ratedCapacity: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'c1' },
      },
    );
    expect(filterGroups(groups, 'accepted', '', 'en').map((g) => g.key)).toEqual(['ratedCapacity']);
    expect(filterGroups(groups, 'pending', '', 'en').map((g) => g.key)).toEqual(['nominalVoltage']);
    expect(filterGroups(groups, 'all', 'volt', 'en').map((g) => g.key)).toEqual(['nominalVoltage']);
  });
  it('lists composite leaves and category attributes', () => {
    expect(compositeLeaves('batteryChemistry')).toEqual(['shortName', 'clearName']);
    expect(compositeLeaves('criticalRawMaterials')).toEqual([]);
    expect(compositeLeaves('ratedCapacity')).toEqual([]);
    expect(attributeChoices('EV').some((a) => a.id === 'ratedCapacity')).toBe(true);
  });

  it('reaches nested object and multilingual leaves with dotted paths', () => {
    const leaves = compositeLeaves('manufacturerInformation');
    expect(leaves).toContain('name.de');
    expect(leaves).toContain('name.en');
    expect(leaves).toContain('identifier');
    expect(leaves).toContain('address.cityTown');
    // A sub-object is not itself a leaf; only its scalar fields are offered.
    expect(leaves).not.toContain('address');
    expect(leaves).not.toContain('name');
  });

  it('skips repeated rows in field-by-field entry: a composite made of an array has no leaves', () => {
    expect(compositeLeaves('hazardousSubstances')).toEqual([]);
    expect(compositeLeaves('carbonFootprintGeneralInformation')).toEqual([
      'referenceImpactUnit',
      'quantityOfMeasure',
    ]);
    const ids = attributeChoices('EV').map((a) => a.id);
    expect(ids).toContain('manufacturerInformation');
  });

  it('attributeChoices includes array composites', () => {
    expect(attributeChoices('EV').map((c) => c.id)).toContain('criticalRawMaterials');
  });
  it('arrayEntries lists array values from the draft and from manual decisions', () => {
    const draft = getSample('ev-valid') as PassportDraft;
    const fromDraft = arrayEntries('EV', draft, {});
    expect(fromDraft.find((e) => e.attributeId === 'criticalRawMaterials')).toMatchObject({
      origin: 'draft',
    });
    expect(fromDraft.every((e) => e.rows > 0)).toBe(true);
    const withManual = arrayEntries('EV', draft, {
      criticalRawMaterials: {
        kind: 'manual',
        attributeId: 'criticalRawMaterials',
        value: [{ name: 'Li', identifier: 'x' }],
      },
    });
    expect(withManual.find((e) => e.attributeId === 'criticalRawMaterials')).toEqual({
      attributeId: 'criticalRawMaterials',
      name: expect.objectContaining({ de: expect.any(String), en: expect.any(String) }),
      rows: 1,
      origin: 'manual',
    });
  });
});
