import type { Fact, MappingProposal } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { factStatuses, filterFacts } from '@/workflow/factsModel.ts';

const fact = (id: string, over: Partial<Fact> = {}): Fact => ({
  id,
  label: 'Nennkapazität',
  labelKey: 'nennkapazitaet',
  raw: '94,5',
  value: '94.5',
  kind: 'decimal',
  unit: 'Ah',
  lang: 'de',
  shape: 'kv',
  source: { file: 'a.pdf', page: 1 },
  ...over,
});
const proposal = (factId: string): MappingProposal => ({
  attributeId: 'ratedCapacity',
  value: '94.5',
  factId,
  confidence: 0.9,
  source: [{ file: 'a.pdf', page: 1 }],
  why: { de: 'x', en: 'x' },
  checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' },
});

describe('factStatuses', () => {
  it('marks mapped, proposed and unmapped', () => {
    const facts = [fact('a'), fact('b'), fact('c')];
    const s = factStatuses(facts, [proposal('a'), proposal('b')], {
      ratedCapacity: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a' },
    });
    expect(s['a']).toEqual({ status: 'mapped', attributeId: 'ratedCapacity' });
    expect(s['b']).toEqual({ status: 'proposed' });
    expect(s['c']).toEqual({ status: 'unmapped' });
  });
  it('a manual decision with a factId counts as mapped; a reject does not', () => {
    const s = factStatuses([fact('a'), fact('b')], [proposal('b')], {
      nominalVoltage: { kind: 'manual', attributeId: 'nominalVoltage', value: '1', factId: 'a' },
      ratedCapacity: { kind: 'reject', attributeId: 'ratedCapacity', factId: 'b' },
    });
    expect(s['a']).toEqual({ status: 'mapped', attributeId: 'nominalVoltage' });
    expect(s['b']).toEqual({ status: 'proposed' });
  });
  it('an accept or edit decision counts as mapped only when a matching proposal exists', () => {
    const facts = [fact('a'), fact('b')];
    // No proposal at all corroborates the decision: derivation would drop it, so the screen
    // must not claim a mapping the draft does not hold.
    const s1 = factStatuses(facts, [], {
      ratedCapacity: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a' },
    });
    expect(s1['a']).toEqual({ status: 'unmapped' });

    // A proposal exists for the fact, just naming a different attribute: falls back to proposed.
    const s2 = factStatuses(facts, [proposal('a')], {
      nominalVoltage: { kind: 'edit', attributeId: 'nominalVoltage', factId: 'a', value: '1' },
    });
    expect(s2['a']).toEqual({ status: 'proposed' });
  });
});

describe('filterFacts', () => {
  const facts = [
    fact('a'),
    fact('b', { source: { file: 'b.xlsx', cell: 'B2' }, label: 'Voltage' }),
  ];
  const statuses = factStatuses(facts, [proposal('a')], {});
  it('filters by document, status and text', () => {
    expect(
      filterFacts(facts, statuses, { document: 'b.xlsx', status: 'all', search: '' }, 'en').map(
        (f) => f.id,
      ),
    ).toEqual(['b']);
    expect(
      filterFacts(facts, statuses, { document: 'all', status: 'unmapped', search: '' }, 'en').map(
        (f) => f.id,
      ),
    ).toEqual(['b']);
    expect(
      filterFacts(facts, statuses, { document: 'all', status: 'all', search: 'b2' }, 'en').map(
        (f) => f.id,
      ),
    ).toEqual(['b']);
    expect(
      filterFacts(facts, statuses, { document: 'all', status: 'all', search: 'nenn' }, 'en').map(
        (f) => f.id,
      ),
    ).toEqual(['a']);
  });
});
