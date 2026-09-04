import { CHECKS, PassportDraft, validatePlausibility } from '@passwerk/core';
import { getAttribute, getRule, plausibilityRules } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const getAttributeExists = (id: string) => getAttribute(id) !== undefined;

describe('plausibility manifest', () => {
  it('every check key is a knowledge-base rule', () => {
    for (const id of Object.keys(CHECKS)) expect(getRule(id), id).toBeDefined();
  });

  it('every rule carries DE and EN title, message and fix hint', () => {
    for (const rule of plausibilityRules) {
      for (const field of ['title', 'message', 'fixHint'] as const) {
        expect(rule[field].de.length, `${rule.id}.${field}.de`).toBeGreaterThan(0);
        expect(rule[field].en.length, `${rule.id}.${field}.en`).toBeGreaterThan(0);
      }
    }
  });

  it('every rule names only attributes that exist in the knowledge base', () => {
    for (const rule of plausibilityRules) {
      for (const id of rule.attributes)
        expect(getAttributeExists(id), `${rule.id}: ${id}`).toBe(true);
    }
  });

  it('DE and EN messages use the same placeholder set', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const rule of plausibilityRules) {
      expect(placeholders(rule.message.de), rule.id).toEqual(placeholders(rule.message.en));
    }
  });

  it('the registry and the rule catalogue are exactly 1:1', () => {
    const ruleIdsInKb = plausibilityRules.map((r) => r.id).sort();
    expect(Object.keys(CHECKS).sort()).toEqual(ruleIdsInKb);
  });

  it('no finding leaves an unresolved placeholder', async () => {
    const { brokenSamples, samples, validate } = await import('@passwerk/core');
    const drafts = [...Object.values(samples), ...Object.values(brokenSamples).map((b) => b.draft)];
    for (const draft of drafts) {
      for (const finding of validate(draft).findings) {
        expect(finding.message.de, finding.ruleId).not.toMatch(/\{\w+\}/);
        expect(finding.message.en, finding.ruleId).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('throws when a check leaves a rule message placeholder unresolved', () => {
    // PW-PLAUS-002's message needs {min}, {nom} and {max}; a check that forgets one is a
    // programming error (check and rule disagree), not a data problem, so it must throw
    // rather than ship a literal "{max}" in a user-facing finding.
    const original = CHECKS['PW-PLAUS-002'];
    CHECKS['PW-PLAUS-002'] = () => [{ attributeId: 'nominalVoltage', params: { min: '1' } }];
    try {
      const draft = PassportDraft.parse({
        meta: {
          schemaVersion: '1.0',
          category: 'EV',
          createdAt: '2026-09-03T12:00:00Z',
          passportId: 'https://example.org/bp/1',
        },
        attributes: {
          minimumVoltage: { value: '400', status: 'present', source: [] },
          nominalVoltage: { value: '300', status: 'present', source: [] },
          maximumVoltage: { value: '450', status: 'present', source: [] },
        },
      });
      expect(() => validatePlausibility(draft)).toThrow(/unresolved/);
    } finally {
      CHECKS['PW-PLAUS-002'] = original as (typeof CHECKS)['PW-PLAUS-002'];
    }
  });
});
