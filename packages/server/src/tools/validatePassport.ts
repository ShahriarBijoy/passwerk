import { validate } from '@passwerk/core';
import { z } from 'zod';
import { DraftRef, resolveDraft } from '../refs.js';
import { validationSummary } from '../summary.js';
import { FindingSchema, out, type ToolDefinition } from '../types.js';

const inputSchema = {
  draft: DraftRef,
  asOf: z
    .string()
    .optional()
    .describe(
      'ISO date-time treated as "now" by the plausibility layer; default: draft.meta.createdAt',
    ),
  skipPlausibility: z.boolean().optional().describe('Skip L4 (domain plausibility). Default false'),
};

const outputSchema = out({
  draftId: z.string().optional(),
  verdict: z.enum(['valid', 'valid_with_warnings', 'invalid']).optional(),
  findings: z.array(FindingSchema).optional(),
  layers: z.looseObject({}).optional(),
});

export const validatePassportTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'validate_passport',
  title: 'Validate a passport draft',
  description:
    'Runs all four validation layers on a PassportDraft: L1 schema, L2 AAS meta-model (aas-core), L3 IDTA 02035 template conformance, L4 domain plausibility. Returns the verdict (valid, valid_with_warnings, invalid) and every finding with layer, rule id, path, DE/EN message, legal reference and fix hint. The only source of a validity claim.',
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
    const { aasJson: _aasJson, ...report } = validate(draft, {
      ...(input.asOf !== undefined ? { asOf: input.asOf } : {}),
      ...(input.skipPlausibility !== undefined ? { skipPlausibility: input.skipPlausibility } : {}),
    });
    return { structured: { draftId, ...report }, text: validationSummary(report) };
  },
};
