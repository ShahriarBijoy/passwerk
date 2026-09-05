import { gapReport, validate } from '@passwerk/core';
import { z } from 'zod';
import { DraftRef, resolveDraft } from '../refs.js';
import { gapSummary } from '../summary.js';
import { out, type ToolDefinition } from '../types.js';

const inputSchema = {
  draft: DraftRef,
  asOf: z
    .string()
    .optional()
    .describe('ISO date-time treated as "now" for applicability; default: draft.meta.createdAt'),
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
  sources: z.array(z.string()).optional(),
  isNotLegalAdvice: z.literal(true).optional(),
});

export const gapReportTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'gap_report',
  title: 'Gap report',
  description:
    'The to-do list for a PassportDraft: every attribute bucketed as required, conditional, deferred or optional with status, legal references, who typically has the data and a suggested action; completeness for mandatory and overall data points, grouped by submodel and by data owner. Runs validate_passport first so invalid values count as gaps. Not legal advice.',
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
    return { structured: { draftId, ...gap }, text: gapSummary(gap) };
  },
};
