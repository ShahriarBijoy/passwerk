import { getAttribute } from '@passwerk/rules';
import type { z } from 'zod';
import { isAttributeId } from '../model/attributeIds.js';
import { COMPOSITE_SCHEMAS } from '../model/composites.js';
import type { AnyFieldValue } from '../model/field.js';
import { PassportDraft } from '../model/passport.js';
import { valueSchemaFor } from '../model/values.js';
import type { Finding } from './finding.js';
import { message } from './messages.js';

export interface SchemaResult {
  findings: Finding[];
  /** Set only when the draft is structurally valid (no PW-L1-SCHEMA / unknown attribute). */
  draft?: PassportDraft;
}

type Issue = z.core.$ZodIssue;

function issuePath(issue: Issue): string {
  return issue.path.map(String).join('.');
}

function describeIssues(issues: readonly Issue[]): string {
  return issues.map((i) => `${issuePath(i) || '(root)'}: ${i.message}`).join('; ');
}

function valueFinding(id: string, kind: string, issues: readonly Issue[]): Finding {
  return {
    layer: 'L1',
    ruleId: 'PW-L1-VALUE',
    severity: 'error',
    path: `attributes.${id}.value`,
    attributeId: id,
    message: message('PW-L1-VALUE', `${id} (${kind}): ${describeIssues(issues)}`),
  };
}

function unknownAttributeFindings(input: unknown): Finding[] {
  const raw =
    typeof input === 'object' && input !== null && 'attributes' in input
      ? (input as { attributes: unknown }).attributes
      : undefined;
  if (typeof raw !== 'object' || raw === null) return [];
  return Object.keys(raw)
    .filter((id) => !isAttributeId(id))
    .map((id) => ({
      layer: 'L1' as const,
      ruleId: 'PW-L1-UNKNOWN-ATTRIBUTE',
      severity: 'error' as const,
      path: `attributes.${id}`,
      message: message('PW-L1-UNKNOWN-ATTRIBUTE', id),
    }));
}

function attributeFindings(draft: PassportDraft): Finding[] {
  const findings: Finding[] = [];
  const attrs = draft.attributes as Record<string, AnyFieldValue | undefined>;

  for (const [id, field] of Object.entries(attrs)) {
    if (!field || field.value === undefined) continue;
    const attribute = getAttribute(id);
    if (!attribute) continue; // cannot happen after the unknown-id check

    if (attribute.valueKind === 'composite') {
      const shape = COMPOSITE_SCHEMAS[id];
      if (!shape) {
        findings.push({
          layer: 'L1',
          ruleId: 'PW-L1-COMPOSITE-UNMODELLED',
          severity: 'warning',
          path: `attributes.${id}.value`,
          attributeId: id,
          message: message('PW-L1-COMPOSITE-UNMODELLED', id),
        });
        continue;
      }
      const r = shape.safeParse(field.value);
      if (!r.success) findings.push(valueFinding(id, attribute.valueKind, r.error.issues));
      continue;
    }

    const r = valueSchemaFor(attribute.valueKind).safeParse(field.value);
    if (!r.success) findings.push(valueFinding(id, attribute.valueKind, r.error.issues));
  }

  const passportIdAttr = attrs['batteryPassportIdentifier'];
  if (typeof passportIdAttr?.value === 'string' && passportIdAttr.value !== draft.meta.passportId) {
    findings.push({
      layer: 'L1',
      ruleId: 'PW-L1-PASSPORT-ID-MISMATCH',
      severity: 'error',
      path: 'attributes.batteryPassportIdentifier.value',
      attributeId: 'batteryPassportIdentifier',
      message: message(
        'PW-L1-PASSPORT-ID-MISMATCH',
        `${draft.meta.passportId} vs ${passportIdAttr.value}`,
      ),
    });
  }

  const impacts = attrs['substanceImpacts'];
  const substances = attrs['hazardousSubstances'];
  if (impacts?.value !== undefined && Array.isArray(substances?.value)) {
    const anyAssigned = (substances.value as { impacts?: string[] }[]).some(
      (s) => (s.impacts?.length ?? 0) > 0,
    );
    if (!anyAssigned) {
      findings.push({
        layer: 'L1',
        ruleId: 'PW-L1-IMPACT-UNASSIGNED',
        severity: 'warning',
        path: 'attributes.substanceImpacts.value',
        attributeId: 'substanceImpacts',
        message: message('PW-L1-IMPACT-UNASSIGNED'),
      });
    }
  }

  return findings;
}

/** L1: structural validity of a PassportDraft plus per-attribute value shapes. */
export function validateSchema(input: unknown): SchemaResult {
  const unknown = unknownAttributeFindings(input);
  if (unknown.length > 0) return { findings: unknown };

  const parsed = PassportDraft.safeParse(input);
  if (!parsed.success) {
    return {
      findings: parsed.error.issues.map((issue) => ({
        layer: 'L1' as const,
        ruleId: 'PW-L1-SCHEMA',
        severity: 'error' as const,
        path: issuePath(issue),
        message: message('PW-L1-SCHEMA', `${issuePath(issue) || '(root)'}: ${issue.message}`),
      })),
    };
  }

  return { findings: attributeFindings(parsed.data), draft: parsed.data };
}
