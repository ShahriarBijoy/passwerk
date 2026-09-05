import type { MappingProposal } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import {
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
    expect(compositeLeaves('batteryChemistry')).toContain('clearName');
    expect(compositeLeaves('criticalRawMaterials')).toEqual([]);
    expect(compositeLeaves('ratedCapacity')).toEqual([]);
    expect(attributeChoices('EV').some((a) => a.id === 'ratedCapacity')).toBe(true);
  });
});
