import { dice, entriesFor, type Fact, kindFactor, labelScore, unitFactor } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const fact = (over: Partial<Fact>): Fact => ({
  id: 'f#1:1',
  label: 'x',
  labelKey: 'x',
  raw: '1',
  value: '1',
  kind: 'integer',
  lang: 'de',
  shape: 'kv',
  source: { file: 'f' },
  ...over,
});

describe('scorer', () => {
  it('dice', () => {
    expect(dice(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(dice(['a', 'b'], ['b', 'c'])).toBeCloseTo(0.5);
    expect(dice([], ['a'])).toBe(0);
  });
  it('labelScore: identity beats containment beats partial overlap', () => {
    const name = entriesFor('ratedCapacity').find(
      (e) => e.origin === 'name' && e.text === 'Nennkapazität',
    )!;
    expect(labelScore('nennkapazitaet', name)).toBe(1);
    expect(labelScore('nennkapazitaet pack', name)).toBeCloseTo(2 / 3);
    expect(labelScore('kapazitaet', name)).toBe(0);
  });
  it('unitFactor', () => {
    expect(unitFactor('Ah', fact({ unit: 'Ah' }))).toEqual({ factor: 1, check: 'match' });
    expect(unitFactor('Ah', fact({ unit: 'Ah', rawUnit: 'mAh' }))).toEqual({
      factor: 1,
      check: 'converted',
    });
    expect(unitFactor('Ah', fact({}))).toEqual({ factor: 0.85, check: 'missing' });
    expect(unitFactor(null, fact({ unit: 'Ah' }))).toEqual({ factor: 0.6, check: 'mismatch' });
    expect(unitFactor('Ah', fact({ unit: 'V' }))).toEqual({ factor: 0.3, check: 'mismatch' });
    expect(unitFactor(null, fact({}))).toEqual({ factor: 1, check: 'n/a' });
  });
  it('kindFactor', () => {
    expect(kindFactor('decimal', fact({ kind: 'decimal', value: '94.5' }))).toEqual({
      factor: 1,
      check: 'ok',
    });
    expect(kindFactor('decimal', fact({ kind: 'integer', value: '94' }))).toEqual({
      factor: 1,
      check: 'ok',
    });
    expect(kindFactor('integer', fact({ kind: 'decimal', value: '94.5' }))).toEqual({
      factor: 0.4,
      check: 'mismatch',
    });
    expect(kindFactor('percentage', fact({ kind: 'decimal', value: '120' }))).toEqual({
      factor: 0.4,
      check: 'mismatch',
    });
    expect(kindFactor('date', fact({ kind: 'date', value: '2026-02-10' }))).toEqual({
      factor: 1,
      check: 'ok',
    });
    expect(kindFactor('date', fact({ kind: 'text', value: 'bald' }))).toEqual({
      factor: 0.4,
      check: 'mismatch',
    });
    expect(kindFactor('text', fact({ kind: 'integer' }))).toEqual({ factor: 1, check: 'n/a' });
    expect(kindFactor('uri', fact({ kind: 'uri', value: 'https://x' }))).toEqual({
      factor: 1,
      check: 'ok',
    });
    expect(kindFactor('document', fact({}))).toEqual({ factor: 0, check: 'n/a' });
  });
});
