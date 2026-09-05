import { suggestMappings } from '@passwerk/core';
import { BATTERY_CATEGORIES } from '@passwerk/rules';
import { z } from 'zod';
import { FactsRef, resolveFacts } from '../refs.js';
import { out, type ToolDefinition } from '../types.js';

const inputSchema = {
  facts: FactsRef,
  category: z.enum(BATTERY_CATEGORIES).describe('Passport category; decides applicability'),
  minConfidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Drop proposals below this confidence (default 0). 0.7 is the review threshold'),
};

const outputSchema = out({
  factSetId: z.string().optional(),
  category: z.string().optional(),
  proposals: z
    .array(
      z.looseObject({
        attributeId: z.string(),
        confidence: z.number(),
        why: z.object({ de: z.string(), en: z.string() }),
      }),
    )
    .optional(),
  counts: z.object({ total: z.number(), atLeast07: z.number() }).optional(),
});

export const suggestMappingsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'suggest_mappings',
  title: 'Suggest attribute mappings',
  description:
    'Scores every fact against the knowledge-base synonym index (DE/EN), unit and type checks and the attribute range, and returns candidate mappings sorted by confidence with a DE/EN explanation and provenance. Review proposals under 0.7 with the user or the source page, then pass the accepted ones to apply_mappings.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input, ctx) {
    const { facts, factSetId } = await resolveFacts(input.facts, ctx);
    const min = input.minConfidence ?? 0;
    const all = suggestMappings(facts, { category: input.category });
    const proposals = all.filter((p) => p.confidence >= min);
    const atLeast07 = all.filter((p) => p.confidence >= 0.7).length;
    const top = (lang: 'de' | 'en') =>
      proposals
        .slice(0, 10)
        .map(
          (p) =>
            `- ${p.attributeId}${p.path ? `.${p.path}` : ''} = ${JSON.stringify(p.value)}${p.unit ? ` ${p.unit}` : ''} (${p.confidence.toFixed(2)}): ${p.why[lang]}`,
        );
    return {
      structured: {
        factSetId,
        category: input.category,
        proposals,
        counts: { total: all.length, atLeast07 },
      },
      text: {
        de: [
          `${proposals.length} Vorschläge (${all.length} gesamt, ${atLeast07} mit Konfidenz >= 0,7) für Kategorie ${input.category}.`,
          ...top('de'),
        ].join('\n'),
        en: [
          `${proposals.length} proposals (${all.length} total, ${atLeast07} at confidence >= 0.7) for category ${input.category}.`,
          ...top('en'),
        ].join('\n'),
      },
    };
  },
};
