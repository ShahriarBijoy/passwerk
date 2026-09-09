import type { Fact, FactSet, MappingProposal } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { buildPrompt } from '@/workflow/assist/prompt.ts';
import { buildRequest } from '@/workflow/assist/request.ts';

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
  source: { file: 'geheim-lieferant.pdf', page: 7, cell: 'B12' },
});

const FACTS: FactSet = {
  facts: [
    fact('geheim-lieferant.pdf#7:1', 'Nennspannung (DC)', '400', 'V'),
    fact('geheim-lieferant.pdf#7:2', 'Gesamtgewicht', '512', 'kg'),
  ],
  tables: [],
  documents: [],
};

const PROPOSAL = {
  attributeId: 'nominalVoltage',
  value: '400',
  unit: 'V',
  source: [{ file: 'geheim-lieferant.pdf', page: 7 }],
  confidence: 0.9,
  factId: 'geheim-lieferant.pdf#7:1',
  why: { de: 'x', en: 'x' },
  checks: { label: 1, matched: 'Nennspannung', unit: 'match' as const, kind: 'ok' as const },
};

const built = (language: 'de' | 'en' = 'de', proposals: MappingProposal[] = []) =>
  buildRequest({
    category: 'INDUSTRIAL_GT_2KWH',
    language,
    facts: FACTS,
    proposals,
    decisions: {},
  });

const prompt = (language: 'de' | 'en' = 'de') => buildPrompt(built(language).request);
const both = (language: 'de' | 'en' = 'de') => {
  const p = prompt(language);
  return `${p.system}\n${p.user}`;
};

describe('buildPrompt', () => {
  it('puts every fact the request asks about in front of the model', () => {
    const text = both();
    for (const f of built().request.facts) {
      expect(text).toContain(f.id);
      expect(text).toContain(f.label);
    }
  });

  it('offers the whole catalogue to choose from', () => {
    const text = both();
    for (const e of built().request.catalogue) expect(text).toContain(e.id);
  });

  it('never carries a file name, a page or a cell', () => {
    const text = both();
    expect(text).not.toContain('geheim-lieferant.pdf');
    expect(text).not.toContain('B12');
    // The bare fact ids embed the file name; only the tokens may appear.
    for (const f of FACTS.facts) expect(text).not.toContain(f.id);
  });

  it('spells out the answer contract', () => {
    const text = both();
    for (const token of ['suggestions', 'critiques', 'fact', 'attribute', 'reason', 'JSON']) {
      expect(text).toContain(token);
    }
  });

  it('tells the model it may not supply values', () => {
    expect(prompt().system.toLowerCase()).toContain('value');
    expect(prompt().system).toMatch(/never|not/i);
  });

  it('asks for the reason in the reviewer’s language', () => {
    expect(both('de')).toContain('German');
    expect(both('en')).toContain('English');
  });

  it('is deterministic', () => {
    expect(buildPrompt(built().request)).toEqual(buildPrompt(built().request));
  });

  it('says there is nothing to critique when no proposal was sent', () => {
    expect(prompt().user).toContain('(none)');
  });

  it('shows the model the label a critique candidate came from', () => {
    // The critique question is "does this label mean this attribute". A row without the label
    // cannot be answered, only guessed at.
    const request = built('de', [PROPOSAL]).request;
    const line = buildPrompt(request).user;
    expect(line).toContain('Nennspannung (DC)');
    expect(line).toContain('nominalVoltage');
  });
});
