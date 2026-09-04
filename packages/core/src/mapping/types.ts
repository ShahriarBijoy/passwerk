import { z } from 'zod';
import { PassportDraft } from '../model/passport.js';
import { Provenance } from '../model/provenance.js';
import { IsoDateTime } from '../model/values.js';

export const MappingChecks = z.object({
  label: z.number().min(0).max(1),
  matched: z.string(),
  unit: z.enum(['match', 'converted', 'missing', 'mismatch', 'n/a']),
  kind: z.enum(['ok', 'mismatch', 'n/a']),
});
export type MappingChecks = z.infer<typeof MappingChecks>;

export const MappingProposal = z.object({
  attributeId: z.string().min(1),
  value: z.unknown(),
  unit: z.string().optional(),
  path: z.string().optional(),
  source: z.array(Provenance).min(1),
  confidence: z.number().min(0).max(1),
  factId: z.string().min(1),
  why: z.object({ de: z.string(), en: z.string() }),
  checks: MappingChecks,
});
export type MappingProposal = z.infer<typeof MappingProposal>;

export const MappingDecision = z.object({
  attributeId: z.string().min(1),
  value: z.unknown(),
  unit: z.string().optional(),
  path: z.string().optional(),
  source: z.array(Provenance).optional(),
  confidence: z.number().min(0).max(1).optional(),
  recordedAt: IsoDateTime.optional(),
  override: z.boolean().optional(),
});
export type MappingDecision = z.infer<typeof MappingDecision>;

export const MappingConflict = z.object({
  attributeId: z.string(),
  existing: z.unknown(),
  incoming: z.unknown(),
  source: z.array(Provenance),
});
export type MappingConflict = z.infer<typeof MappingConflict>;

export const ApplyResult = z.object({
  draft: PassportDraft,
  applied: z.number().int().nonnegative(),
  conflicts: z.array(MappingConflict),
});
export type ApplyResult = z.infer<typeof ApplyResult>;
