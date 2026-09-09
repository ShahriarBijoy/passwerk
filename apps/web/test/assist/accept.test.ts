import type { Fact, FactSet } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { suggestionPrefill } from '@/workflow/assist/accept.ts';
import type { AssistSuggestion } from '@/workflow/assist/types.ts';

const fact = (id: string, value: string, unit?: string): Fact => ({
  id,
  label: 'Nennspannung',
  labelKey: 'nennspannung',
  raw: `${value} ${unit ?? ''}`.trim(),
  value,
  kind: 'decimal',
  ...(unit === undefined ? {} : { unit }),
  lang: 'de',
  shape: 'kv',
  source: { file: 'a.pdf', page: 1 },
});

const FACTS: FactSet = { facts: [fact('a.pdf#1:1', '400', 'V')], tables: [], documents: [] };

const suggestion: AssistSuggestion = {
  factId: 'a.pdf#1:1',
  attributeId: 'nominalVoltage',
  reason: 'Nennspannung',
};

describe('suggestionPrefill', () => {
  it('fills the dialog with the attribute and the fact’s own value', () => {
    expect(suggestionPrefill(suggestion, FACTS)).toEqual({
      factId: 'a.pdf#1:1',
      value: '400',
      unit: 'V',
      attributeId: 'nominalVoltage',
    });
  });

  it('carries the composite leaf through', () => {
    const withPath = { ...suggestion, path: 'name.de' };
    expect(suggestionPrefill(withPath, FACTS)?.path).toBe('name.de');
  });

  it('falls back to the raw text when the fact has no normalised value', () => {
    const raw: FactSet = {
      ...FACTS,
      facts: [{ ...fact('a.pdf#1:2', 'x'), value: undefined, raw: 'LFP' }],
    };
    expect(suggestionPrefill({ ...suggestion, factId: 'a.pdf#1:2' }, raw)?.value).toBe('LFP');
  });

  it('gives up when the fact is gone, rather than inventing a value', () => {
    // A re-upload prunes facts; a suggestion can outlive the one it named.
    expect(suggestionPrefill({ ...suggestion, factId: 'gone#1:1' }, FACTS)).toBeNull();
  });
});
