import { BATTERY_TYPES, checkObligations, ROLES } from '@passwerk/core';
import { z } from 'zod';
import { out, type ToolDefinition } from '../types.js';

const inputSchema = {
  batteryType: z.enum(BATTERY_TYPES).describe('Battery type as placed on the market'),
  role: z.enum(ROLES).describe('Economic operator role of the asker'),
  energyKwh: z
    .string()
    .optional()
    .describe(
      'Battery energy in kWh as a decimal string, e.g. "2.5". Decides the industrial 2 kWh threshold',
    ),
  placedOnMarketDate: z
    .string()
    .optional()
    .describe('ISO date the battery is or was placed on the market or put into service'),
  asOf: z.string().optional().describe('ISO date treated as "now"; default: the server clock'),
};

const outputSchema = out({
  verdict: z.enum(['required', 'not_required', 'insufficient_input']).optional(),
  reason: z.object({ de: z.string(), en: z.string() }).optional(),
  missingInput: z.array(z.string()).optional(),
  category: z.string().nullable().optional(),
  mandatoryAttributes: z.array(z.string()).optional(),
  conditionalAttributes: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  isNotLegalAdvice: z.literal(true).optional(),
  asOf: z.string().optional(),
});

export const checkObligationsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'check_obligations',
  title: 'Check battery passport obligations',
  description:
    'Whether a battery passport is required for a battery type, role, energy and market date under Regulation (EU) 2023/1542 Article 77(1); returns the category, the mandatory, conditional and deferred attribute sets and the legal timeline. Answers required, not_required or insufficient_input. Not legal advice.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input, ctx) {
    const asOf = input.asOf ?? ctx.clock;
    const result = checkObligations({
      batteryType: input.batteryType,
      role: input.role,
      asOf,
      ...(input.energyKwh !== undefined ? { energyKwh: input.energyKwh } : {}),
      ...(input.placedOnMarketDate !== undefined
        ? { placedOnMarketDate: input.placedOnMarketDate }
        : {}),
    });
    const n = result.mandatoryAttributes.length;
    const missing =
      result.missingInput.length > 0
        ? {
            de: ` Fehlende Angaben: ${result.missingInput.join(', ')}.`,
            en: ` Missing input: ${result.missingInput.join(', ')}.`,
          }
        : { de: '', en: '' };
    return {
      structured: { ...result, asOf },
      text: {
        de: `${result.verdict}: ${result.reason.de}${missing.de} Kategorie: ${result.category ?? '-'}. Pflichtattribute: ${n}. Keine Rechtsberatung.`,
        en: `${result.verdict}: ${result.reason.en}${missing.en} Category: ${result.category ?? '-'}. Mandatory attributes: ${n}. Not legal advice.`,
      },
    };
  },
};
