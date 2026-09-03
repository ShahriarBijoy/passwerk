import { BATTERY_CATEGORIES } from '@passwerk/rules';
import { z } from 'zod';
import { AttributeIdSchema } from './attributeIds.js';
import { AnyField, type AnyFieldValue } from './field.js';
import { IsoDateTime, Uri } from './values.js';

export const SCHEMA_VERSION = '1.0' as const;

export const BatteryCategory = z.enum(BATTERY_CATEGORIES);
export type BatteryCategory = z.infer<typeof BatteryCategory>;

export const PassportMeta = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  category: BatteryCategory,
  /** Injected by the caller so output is deterministic. */
  createdAt: IsoDateTime,
  /** The battery passport identifier (DIN 6.1.2.1), a URI. Also the AAS global asset id. */
  passportId: Uri,
});
export type PassportMeta = z.infer<typeof PassportMeta>;

/**
 * The neutral internal model (BUILD_PLAN 2.3, ADR D-010): one Field per DIN attribute,
 * keyed by the knowledge-base id. Value shapes are checked per valueKind in validate/schema.
 */
export const PassportDraft = z.object({
  meta: PassportMeta,
  attributes: z.partialRecord(AttributeIdSchema, AnyField),
});
export type PassportDraft = z.infer<typeof PassportDraft>;
export type PassportDraftInput = z.input<typeof PassportDraft>;

export function getField(draft: PassportDraft, id: string): AnyFieldValue | undefined {
  return (draft.attributes as Record<string, AnyFieldValue | undefined>)[id];
}

/** The value of an attribute when it is present (or in conflict), else undefined. */
export function presentValue<T = unknown>(draft: PassportDraft, id: string): T | undefined {
  const f = getField(draft, id);
  if (!f || f.value === undefined) return undefined;
  if (f.status !== 'present' && f.status !== 'conflict') return undefined;
  return f.value as T;
}
