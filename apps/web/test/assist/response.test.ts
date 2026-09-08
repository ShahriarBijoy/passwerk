import type { Fact, FactSet } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { buildRequest } from '@/workflow/assist/request.ts';
import { parseResponse } from '@/workflow/assist/response.ts';
import type { AssistDiscard } from '@/workflow/assist/types.ts';
import type { Decision, DecisionKey } from '@/workflow/state.ts';

const fact = (id: string, label: string, value: string, unit?: string): Fact => ({
  id,
  label,
  labelKey: label.toLowerCase(),
  raw: value,
  value,
  kind: 'decimal',
  ...(unit === undefined ? {} : { unit }),
  lang: 'de',
  shape: 'kv',
  source: { file: 'geheim-lieferant.pdf', page: 2 },
});

const FACTS: FactSet = {
  facts: [
    fact('geheim-lieferant.pdf#2:1', 'Spannung', '400', 'V'),
    fact('geheim-lieferant.pdf#2:2', 'Gewicht', '512', 'kg'),
    fact('geheim-lieferant.pdf#2:3', 'Hersteller', 'Musterwerk GmbH'),
  ],
  tables: [],
  documents: [],
};

const context = (decisions: Record<DecisionKey, Decision> = {}) => {
  const { refs } = buildRequest({
    category: 'INDUSTRIAL_GT_2KWH',
    language: 'de',
    facts: FACTS,
    proposals: [],
    decisions,
  });
  return { refs, category: 'INDUSTRIAL_GT_2KWH' as const, facts: FACTS, decisions };
};

const body = (obj: unknown) => JSON.stringify(obj);
const suggest = (fact: string, attribute: string, extra: Record<string, unknown> = {}) =>
  body({ suggestions: [{ fact, attribute, reason: 'weil', ...extra }], critiques: [] });

const reasons = (discards: AssistDiscard[]) => discards.map((d) => d.reason);

describe('parseResponse: what it accepts', () => {
  it('keeps a suggestion naming a real fact and a real attribute', () => {
    const r = parseResponse(suggest('f0', 'nominalVoltage'), context());
    expect(r.suggestions).toEqual([
      {
        factId: 'geheim-lieferant.pdf#2:1',
        attributeId: 'nominalVoltage',
        reason: 'weil',
      },
    ]);
    expect(r.discards).toEqual([]);
  });

  it('resolves the token back to core’s fact id', () => {
    const r = parseResponse(
      suggest('f2', 'manufacturerInformation', { path: 'name.de' }),
      context(),
    );
    expect(r.suggestions[0]?.factId).toBe('geheim-lieferant.pdf#2:3');
    expect(r.suggestions[0]?.path).toBe('name.de');
  });

  it('reads a body wrapped in prose and a code fence', () => {
    const text = `Here you go:\n\`\`\`json\n${suggest('f0', 'nominalVoltage')}\n\`\`\`\nHope that helps.`;
    expect(parseResponse(text, context()).suggestions).toHaveLength(1);
  });

  it('treats missing arrays as empty rather than failing', () => {
    const r = parseResponse('{}', context());
    expect(r).toEqual({ suggestions: [], critiques: [], discards: [] });
  });
});

describe('parseResponse: the value never comes from the model', () => {
  it('ignores a value and a unit the model volunteers', () => {
    const r = parseResponse(
      suggest('f0', 'nominalVoltage', { value: '999999', unit: 'furlongs', confidence: 1 }),
      context(),
    );
    expect(r.suggestions[0]).toEqual({
      factId: 'geheim-lieferant.pdf#2:1',
      attributeId: 'nominalVoltage',
      reason: 'weil',
    });
    expect(JSON.stringify(r)).not.toContain('999999');
    expect(JSON.stringify(r)).not.toContain('furlongs');
  });
});

describe('parseResponse: guards', () => {
  it('discards an invented attribute id', () => {
    const r = parseResponse(suggest('f0', 'totallyMadeUpAttribute'), context());
    expect(r.suggestions).toEqual([]);
    expect(reasons(r.discards)).toEqual(['unknown-attribute']);
  });

  it('discards a real attribute the category does not display', () => {
    // `certifiedUsableBatteryEnergy` is an EV/LMT attribute; an industrial battery does not
    // display it, so the picker does not offer it and neither may the model.
    const r = parseResponse(suggest('f0', 'certifiedUsableBatteryEnergy'), context());
    expect(r.suggestions).toEqual([]);
    expect(reasons(r.discards)).toEqual(['not-applicable']);
  });

  it('discards an invented fact token', () => {
    const r = parseResponse(suggest('f99', 'nominalVoltage'), context());
    expect(reasons(r.discards)).toEqual(['unknown-fact']);
  });

  it('discards a leaf the composite does not have', () => {
    const r = parseResponse(
      suggest('f2', 'manufacturerInformation', { path: 'name.klingon' }),
      context(),
    );
    expect(reasons(r.discards)).toEqual(['unknown-path']);
  });

  it('discards a mapping whose value core refuses to carry', () => {
    // 'Musterwerk GmbH' is not a decimal, so `proposalValue` returns undefined for batteryMass.
    const r = parseResponse(suggest('f2', 'batteryMass'), context());
    expect(r.suggestions).toEqual([]);
    expect(reasons(r.discards)).toEqual(['value-refused']);
  });

  it('discards the second of two identical suggestions', () => {
    const text = body({
      suggestions: [
        { fact: 'f0', attribute: 'nominalVoltage', reason: 'a' },
        { fact: 'f0', attribute: 'nominalVoltage', reason: 'b' },
      ],
    });
    const r = parseResponse(text, context());
    expect(r.suggestions).toHaveLength(1);
    expect(reasons(r.discards)).toEqual(['duplicate']);
  });

  it('discards a suggestion for something the reviewer already decided', () => {
    const decisions: Record<DecisionKey, Decision> = {
      nominalVoltage: {
        kind: 'accept',
        attributeId: 'nominalVoltage',
        factId: 'geheim-lieferant.pdf#2:2',
      },
    };
    const ctx = context();
    const r = parseResponse(suggest('f0', 'nominalVoltage'), { ...ctx, decisions });
    expect(reasons(r.discards)).toEqual(['already-decided']);
  });

  it('names the attribute and fact on every discard so the panel can show them', () => {
    const r = parseResponse(suggest('f0', 'totallyMadeUpAttribute'), context());
    expect(r.discards[0]).toEqual({
      kind: 'suggestion',
      reason: 'unknown-attribute',
      attributeId: 'totallyMadeUpAttribute',
      factId: 'geheim-lieferant.pdf#2:1',
    });
  });
});

describe('parseResponse: critiques', () => {
  const withProposal = () => {
    const built = buildRequest({
      category: 'INDUSTRIAL_GT_2KWH',
      language: 'de',
      facts: FACTS,
      proposals: [
        {
          attributeId: 'nominalVoltage',
          value: '400',
          unit: 'V',
          source: [{ file: 'geheim-lieferant.pdf', page: 2 }],
          confidence: 0.9,
          factId: 'geheim-lieferant.pdf#2:1',
          why: { de: 'x', en: 'x' },
          checks: { label: 1, matched: 'Spannung', unit: 'match', kind: 'ok' },
        },
      ],
      decisions: {},
    });
    return {
      refs: built.refs,
      category: 'INDUSTRIAL_GT_2KWH' as const,
      facts: FACTS,
      decisions: {},
    };
  };

  it('resolves a critique to the proposal it is about', () => {
    const text = body({ critiques: [{ proposal: 'p0', reason: 'Das ist die Ladespannung.' }] });
    const r = parseResponse(text, withProposal());
    expect(r.critiques).toEqual([
      {
        factId: 'geheim-lieferant.pdf#2:1',
        attributeId: 'nominalVoltage',
        reason: 'Das ist die Ladespannung.',
      },
    ]);
  });

  it('discards a critique of a proposal that was never sent', () => {
    const text = body({ critiques: [{ proposal: 'p7', reason: 'x' }] });
    const r = parseResponse(text, withProposal());
    expect(r.critiques).toEqual([]);
    expect(reasons(r.discards)).toEqual(['unknown-proposal']);
  });
});

describe('parseResponse: a body it cannot read', () => {
  it('throws with the raw text so the panel can show what came back', () => {
    expect(() => parseResponse('I am afraid I cannot help with that.', context())).toThrow(
      /I am afraid/,
    );
  });

  it('throws when the JSON parses but the shape is wrong', () => {
    expect(() => parseResponse('{"suggestions": "lots"}', context())).toThrow();
  });
});
