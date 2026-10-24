import { gapReport, type PassportDraft, validate } from '@passwerk/core';
import { attributes } from '@passwerk/rules';

/**
 * Required attributes the draft does not hold as present, then the attributes under template
 * elements L3 reports missing: once a submodel exists, its template wants them too.
 */
export function openTargets(draft: PassportDraft, asOf: string): string[] {
  const report = validate(draft, { asOf });
  const open = gapReport(draft, { report, asOf })
    .items.filter((i) => i.bucket === 'required' && i.status !== 'present')
    .map((i) => i.attributeId);
  const missing = report.findings
    .filter((f) => f.ruleId === 'PW-L3-MISSING')
    .flatMap((f) => (f.templatePath ? [f.templatePath] : []));
  const companions = attributes
    .filter(
      (a) =>
        !open.includes(a.id) &&
        draft.attributes[a.id]?.status !== 'present' &&
        a.templatePaths.some((p) => missing.some((m) => p === m || p.startsWith(`${m}/`))),
    )
    .map((a) => a.id);
  return [...open, ...companions];
}
