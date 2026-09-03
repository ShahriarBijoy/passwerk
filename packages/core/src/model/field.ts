import { z } from 'zod';
import { Provenance } from './provenance.js';
import { IsoDateTime } from './values.js';

export const FieldStatus = z.enum(['present', 'missing', 'conflict', 'not_applicable']);
export type FieldStatus = z.infer<typeof FieldStatus>;

/**
 * Every leaf of a PassportDraft is a Field: value + provenance + confidence + status.
 * Invariants: status 'present' requires a value; a value requires 'present' or 'conflict'.
 */
export const Field = <T extends z.ZodType>(inner: T) =>
  z
    .object({
      value: inner.optional(),
      unit: z.string().min(1).optional(),
      source: z.array(Provenance).default([]),
      confidence: z.number().min(0).max(1).optional(),
      status: FieldStatus.default('missing'),
      /** When the value was measured or last updated (ISO-8601); feeds part 5 LastUpdate. */
      recordedAt: IsoDateTime.optional(),
    })
    .superRefine((field, ctx) => {
      const hasValue = field.value !== undefined;
      if (field.status === 'present' && !hasValue) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'status present requires a value',
        });
      }
      if (hasValue && field.status !== 'present' && field.status !== 'conflict') {
        ctx.addIssue({
          code: 'custom',
          path: ['status'],
          message: `a value requires status present or conflict, got ${field.status}`,
        });
      }
    });

export const AnyField = Field(z.unknown());
export type AnyFieldValue = z.infer<typeof AnyField>;
