import { getRule } from '@passwerk/rules';
import type { RuleContext } from './context.js';

export interface RuleViolation {
  /** Draft path. Defaults to `attributes.<attributeId>.value`. */
  path?: string;
  attributeId?: string;
  /** Values for the named placeholders the rule's DE/EN message uses. */
  params?: Record<string, string>;
}

export type RuleCheck = (ctx: RuleContext) => RuleViolation[];

/** The attribute ids a rule declares in the knowledge base. */
export function ruleAttributes(ruleId: string): readonly string[] {
  const rule = getRule(ruleId);
  if (!rule) throw new Error(`@passwerk/core: unknown rule ${ruleId}`);
  return rule.attributes;
}

/** One check per PW-PLAUS rule id. Keys must match kb/rules.json exactly (see manifest test). */
export const CHECKS: Record<string, RuleCheck> = {
  /** Listed percentages must lie between 0 and 100. */
  'PW-PLAUS-001': (ctx) => {
    const out: RuleViolation[] = [];
    for (const id of ruleAttributes('PW-PLAUS-001')) {
      const d = ctx.decimal(id);
      if (d === undefined) continue;
      if (d.gte(0) && d.lte(100)) continue;
      out.push({ attributeId: id, params: { attribute: id, value: d.toString() } });
    }
    return out;
  },

  /** minimum <= nominal <= maximum voltage. Needs all three to say anything. */
  'PW-PLAUS-002': (ctx) => {
    const min = ctx.decimal('minimumVoltage');
    const nom = ctx.decimal('nominalVoltage');
    const max = ctx.decimal('maximumVoltage');
    if (min === undefined || nom === undefined || max === undefined) return [];
    if (min.lte(nom) && nom.lte(max)) return [];
    return [
      {
        attributeId: 'nominalVoltage',
        params: { min: min.toString(), nom: nom.toString(), max: max.toString() },
      },
    ];
  },
};
