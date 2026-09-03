import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import {
  documentIds,
  integral,
  PassportDraft,
  samples,
  templateCategory,
  timestamp,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const base = samples['ev-valid'];

describe('emit shared helpers', () => {
  it('integral strips a zero fraction and leaves everything else alone', () => {
    expect(integral('95.0')).toBe('95');
    expect(integral('95')).toBe('95');
    expect(integral('-3.000')).toBe('-3');
    expect(integral('95.5')).toBe('95.5');
    expect(integral('abc')).toBe('abc');
  });

  it('timestamp prefers recordedAt and falls back to createdAt', () => {
    const draft = PassportDraft.parse({
      ...base,
      attributes: {
        stateOfCharge: { value: '70', status: 'present', recordedAt: '2026-08-31T06:00:00Z' },
        numberOfFullCycles: { value: '12', status: 'present' },
      },
    });
    expect(timestamp(draft, 'stateOfCharge')).toBe('2026-08-31T06:00:00Z');
    expect(timestamp(draft, 'numberOfFullCycles')).toBe(draft.meta.createdAt);
    expect(timestamp(draft, 'absent')).toBe(draft.meta.createdAt);
  });

  it('templateCategory maps the draft category to the template strings', () => {
    const withCategory = (category: string) =>
      PassportDraft.parse({ ...base, meta: { ...base.meta, category } });
    expect(templateCategory(PassportDraft.parse(base))).toBe('ev');
    expect(templateCategory(withCategory('LMT'))).toBe('lmt');
    expect(templateCategory(withCategory('INDUSTRIAL_GT_2KWH'))).toBe('industrial');
    const explicit = PassportDraft.parse({
      ...base,
      attributes: { batteryCategory: { value: 'stationary', status: 'present' } },
    });
    expect(templateCategory(explicit)).toBe('stationary');
    const upper = PassportDraft.parse({
      ...base,
      attributes: { batteryCategory: { value: 'LMT', status: 'present' } },
    });
    expect(templateCategory(upper)).toBe('lmt');
  });

  it('documentIds builds a DocumentIdentifier list preferring the uri', () => {
    const l = documentIds('7/DismantlingAndRemovalInformation', [
      { id: 'DOC-1', uri: 'https://example.test/doc-1.pdf' },
      { id: 'DOC-2' },
    ]);
    expect(l.idShort).toBe('DismantlingAndRemovalInformation');
    const values = l.value?.map((p) => (p as aas.types.Property).value);
    expect(values).toEqual(['https://example.test/doc-1.pdf', 'DOC-2']);
    expect(l.value?.[0]?.idShort).toBeNull();
  });
});
