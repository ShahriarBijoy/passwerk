import type { BatteryCategory } from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import type { AnyFieldValue } from '../../model/field.js';
import { getField, type PassportDraft, presentValue } from '../../model/passport.js';
import type { Finding } from '../finding.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface RuleContext {
  draft: PassportDraft;
  category: BatteryCategory;
  /** ISO date-time treated as "now". Injected; never Date.now(). */
  asOf: string;
  /** The value when the field is present or in conflict and L1 did not reject it. */
  value<T>(id: string): T | undefined;
  /** The value as a Decimal, or undefined when absent or not a decimal string. */
  decimal(id: string): Decimal | undefined;
  /** The value as an ISO date (YYYY-MM-DD), or undefined. */
  date(id: string): string | undefined;
  /** The field's recordedAt, or undefined. */
  recordedAt(id: string): string | undefined;
}

export function createContext(
  draft: PassportDraft,
  options: { asOf?: string; l1Findings?: readonly Finding[] } = {},
): RuleContext {
  // A value L1 rejected is untrustworthy: hide it so no L4 rule restates an L1 finding.
  const hidden = new Set(
    (options.l1Findings ?? [])
      .filter((f) => f.layer === 'L1' && f.severity === 'error' && f.attributeId)
      .map((f) => f.attributeId as string),
  );
  const field = (id: string): AnyFieldValue | undefined =>
    hidden.has(id) ? undefined : getField(draft, id);

  const value = <T>(id: string): T | undefined =>
    hidden.has(id) ? undefined : presentValue<T>(draft, id);

  return {
    draft,
    category: draft.meta.category,
    asOf: options.asOf ?? draft.meta.createdAt,
    value,
    decimal(id) {
      const raw = value<unknown>(id);
      if (typeof raw !== 'string') return undefined;
      try {
        const d = new Decimal(raw);
        return d.isFinite() ? d : undefined;
      } catch {
        return undefined;
      }
    },
    date(id) {
      const raw = value<unknown>(id);
      return typeof raw === 'string' && ISO_DATE_RE.test(raw) ? raw : undefined;
    },
    recordedAt(id) {
      return field(id)?.recordedAt;
    },
  };
}
