import { type GapBucket, type GapStatus, gapReport, validate } from '@passwerk/core';
import { z } from 'zod';
import { DraftRef, resolveDraft } from '../refs.js';
import { gapSummary } from '../summary.js';
import { out, type ToolDefinition } from '../types.js';

const STATUS_VALUES = ['present', 'missing', 'invalid', 'conflict', 'not_applicable'] as const;
const BUCKET_VALUES = ['required', 'conditional', 'deferred', 'optional'] as const;

const inputSchema = {
  draft: DraftRef,
  asOf: z
    .string()
    .optional()
    .describe('ISO date-time treated as "now" for applicability; default: draft.meta.createdAt'),
  detail: z
    .enum(['summary', 'full'])
    .optional()
    .describe(
      'summary (default): open mandatory items, capped at 10. full: every item after the status/bucket filters, grouped by data owner, one line each with status, bucket, legal refs and the suggested next action; no cap',
    ),
  status: z
    .array(z.enum(STATUS_VALUES))
    .optional()
    .describe('Keep only items with one of these statuses; completeness stays unfiltered'),
  bucket: z
    .array(z.enum(BUCKET_VALUES))
    .optional()
    .describe('Keep only items in one of these buckets; completeness stays unfiltered'),
};

const outputSchema = out({
  draftId: z.string().optional(),
  category: z.string().optional(),
  completeness: z
    .object({
      mandatory: z.looseObject({ present: z.number(), total: z.number(), percent: z.string() }),
      overall: z.looseObject({ present: z.number(), total: z.number(), percent: z.string() }),
    })
    .optional(),
  items: z
    .array(z.looseObject({ attributeId: z.string(), status: z.string(), bucket: z.string() }))
    .optional(),
  bySubmodel: z.array(z.looseObject({})).optional(),
  byDataOwner: z.array(z.looseObject({})).optional(),
  filter: z
    .looseObject({
      status: z.array(z.enum(STATUS_VALUES)).optional(),
      bucket: z.array(z.enum(BUCKET_VALUES)).optional(),
    })
    .optional(),
  sources: z.array(z.string()).optional(),
  isNotLegalAdvice: z.literal(true).optional(),
});

export const gapReportTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'gap_report',
  title: 'Gap report',
  description:
    'The to-do list for a PassportDraft: every attribute bucketed as required, conditional, deferred or optional with status, legal references, who typically has the data and a suggested action; completeness for mandatory and overall data points, grouped by submodel and by data owner. Runs validate_passport first so invalid values count as gaps. Ask for detail "full" and a status/bucket filter to see every open attribute with its legal reference and next action, unabridged, for use without the structured content. Not legal advice.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input, ctx) {
    const { draft, draftId } = await resolveDraft(input.draft, ctx);
    const asOf = input.asOf !== undefined ? { asOf: input.asOf } : {};
    const report = validate(draft, asOf);
    const gap = gapReport(draft, { report, ...asOf });

    const statusSet: Set<GapStatus> | null = input.status ? new Set(input.status) : null;
    const bucketSet: Set<GapBucket> | null = input.bucket ? new Set(input.bucket) : null;
    const filtered = statusSet !== null || bucketSet !== null;
    const items = filtered
      ? gap.items.filter(
          (i) => (!statusSet || statusSet.has(i.status)) && (!bucketSet || bucketSet.has(i.bucket)),
        )
      : gap.items;
    const keepIds = new Set(items.map((i) => i.attributeId));
    const narrow = <T extends { attributeIds: string[] }>(groups: T[]): T[] =>
      filtered
        ? groups
            .map((g) => ({ ...g, attributeIds: g.attributeIds.filter((id) => keepIds.has(id)) }))
            .filter((g) => g.attributeIds.length > 0)
        : groups;
    const bySubmodel = narrow(gap.bySubmodel);
    const byDataOwner = narrow(gap.byDataOwner);

    const text = gapSummary(gap, {
      items,
      ...(input.detail !== undefined ? { detail: input.detail } : {}),
      filtered,
    });

    return {
      structured: {
        draftId,
        ...gap,
        items,
        bySubmodel,
        byDataOwner,
        ...(filtered
          ? {
              filter: {
                ...(input.status ? { status: input.status } : {}),
                ...(input.bucket ? { bucket: input.bucket } : {}),
              },
            }
          : {}),
      },
      text,
    };
  },
};
