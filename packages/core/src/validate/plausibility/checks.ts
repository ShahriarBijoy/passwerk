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
export const CHECKS: Record<string, RuleCheck> = {};
