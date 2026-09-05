import { explain, explainAttribute, explainRule } from '@passwerk/core';
import { attributes, plausibilityRules } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('explainAttribute', () => {
  it('answers for every attribute in the knowledge base', () => {
    for (const attribute of attributes) {
      const e = explainAttribute(attribute.id);
      expect(e, attribute.id).toBeDefined();
      expect(e?.name.de.length, attribute.id).toBeGreaterThan(0);
      expect(e?.name.en.length, attribute.id).toBeGreaterThan(0);
      expect(e?.explanation.de.length, attribute.id).toBeGreaterThan(0);
      expect(e?.isNotLegalAdvice).toBe(true);
    }
  });

  it('carries the template details and the applicability per category', () => {
    const e = explainAttribute('batteryMass');
    expect(e?.template.length).toBeGreaterThan(0);
    expect(e?.template[0]?.semanticId).toBeTruthy();
    expect(e?.applicability.EV.status).toBeTruthy();
    expect(e?.applicability.INDUSTRIAL_GT_2KWH.status).toBeTruthy();
    expect(e?.legalRefs.length).toBeGreaterThan(0);
    expect(e?.definition.length).toBeGreaterThan(0);
  });

  it('lists the rules that read the attribute', () => {
    expect(explainAttribute('nominalVoltage')?.relatedRules).toContain('PW-PLAUS-002');
  });

  it('returns undefined for an unknown id', () => {
    expect(explainAttribute('notAnAttribute')).toBeUndefined();
  });
});

describe('explainRule', () => {
  it('answers for every plausibility rule with both languages', () => {
    for (const rule of plausibilityRules) {
      const e = explainRule(rule.id);
      expect(e?.title.de.length, rule.id).toBeGreaterThan(0);
      expect(e?.fixHint.en.length, rule.id).toBeGreaterThan(0);
      expect(e?.attributes.length, rule.id).toBeGreaterThan(0);
      expect(e?.attributes[0]?.name.de.length, rule.id).toBeGreaterThan(0);
    }
  });

  it('answers for an engine rule id so an agent can look up any finding', () => {
    const e = explainRule('PW-L3-MISSING');
    expect(e?.message.de.length).toBeGreaterThan(0);
    expect(e?.legalRef).toBeNull();
    // An engine rule has no single severity: PW-L1-DOCUMENT-UNCLASSIFIED is a warning
    // while PW-L3-MISSING is an error, and the finding carries the real value.
    expect(e?.severity).toBeNull();
    expect(e?.attributes).toEqual([]);
  });

  it('returns undefined for an unknown id', () => {
    expect(explainRule('PW-PLAUS-999')).toBeUndefined();
  });
});

describe('explain', () => {
  it('dispatches on the PW- prefix', () => {
    expect(explain('PW-PLAUS-002')?.kind).toBe('rule');
    expect(explain('batteryMass')?.kind).toBe('attribute');
    expect(explain('nope')).toBeUndefined();
  });
});
