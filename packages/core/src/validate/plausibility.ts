import { getRule, type PlausibilityRule } from '@passwerk/rules';
import type { PassportDraft } from '../model/passport.js';
import type { Finding } from './finding.js';
import { CHECKS, type RuleViolation } from './plausibility/checks.js';
import { createContext } from './plausibility/context.js';

export interface PlausibilityOptions {
  /** ISO date-time used as "now". Default: draft.meta.createdAt. */
  asOf?: string;
  /** L1's findings. Attributes L1 rejected are hidden from every check. */
  l1Findings?: readonly Finding[];
}

/** Replace the named placeholders a rule authored, e.g. "{min} V". */
function interpolate(text: string, params: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = params[key];
    return value === undefined ? whole : value;
  });
}

function toFinding(rule: PlausibilityRule, violation: RuleViolation): Finding {
  const params = violation.params ?? {};
  return {
    layer: 'L4',
    ruleId: rule.id,
    severity: rule.severity,
    path:
      violation.path ??
      (violation.attributeId ? `attributes.${violation.attributeId}.value` : 'attributes'),
    ...(violation.attributeId ? { attributeId: violation.attributeId } : {}),
    message: {
      de: interpolate(rule.message.de, params),
      en: interpolate(rule.message.en, params),
    },
    ...(rule.legalRef ? { legalRef: rule.legalRef } : {}),
    fixHint: rule.fixHint,
  };
}

/**
 * L4: domain plausibility. Rules are data (@passwerk/rules kb/rules.json); the arithmetic
 * is the CHECKS registry. A check never reports a missing value: that is the gap report's
 * job, and it never re-checks a value L1 rejected, because the context hides it.
 */
export function validatePlausibility(
  draft: PassportDraft,
  options: PlausibilityOptions = {},
): { findings: Finding[] } {
  const ctx = createContext(draft, options);
  const findings: Finding[] = [];
  for (const [ruleId, check] of Object.entries(CHECKS)) {
    const rule = getRule(ruleId);
    if (!rule) throw new Error(`@passwerk/core: no knowledge-base rule for ${ruleId}`);
    for (const violation of check(ctx)) findings.push(toFinding(rule, violation));
  }
  findings.sort(
    (a, b) =>
      a.ruleId.localeCompare(b.ruleId) ||
      a.path.localeCompare(b.path) ||
      (a.attributeId ?? '').localeCompare(b.attributeId ?? ''),
  );
  return { findings };
}
