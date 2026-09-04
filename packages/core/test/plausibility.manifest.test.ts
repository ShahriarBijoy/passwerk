import { CHECKS } from '@passwerk/core';
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
});
