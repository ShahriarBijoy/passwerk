import { extractFacts } from '@passwerk/core';
import { z } from 'zod';
import { BundleRef, resolveBundle } from '../refs.js';
import { out, type ToolDefinition } from '../types.js';

const inputSchema = { bundle: BundleRef };

const outputSchema = out({
  factSetId: z.string().optional(),
  bundleId: z.string().optional(),
  facts: z
    .looseObject({
      facts: z.array(z.looseObject({ id: z.string(), label: z.string(), raw: z.string() })),
    })
    .optional(),
});

export const extractFactsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'extract_facts',
  title: 'Extract facts',
  description:
    'Turns a DocumentBundle into a FactSet: labelled values with normalised numbers, units and dates, each with file, page, line or cell provenance. Pure heuristics, no model. Returns the FactSet and a factSetId to pass to suggest_mappings.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input, ctx) {
    const { bundle, bundleId } = await resolveBundle(input.bundle, ctx);
    const facts = extractFacts(bundle);
    const factSetId = await ctx.store.put('facts', facts);
    const n = facts.facts.length;
    const m = bundle.documents.length;
    return {
      structured: { factSetId, bundleId, facts },
      text: {
        de: `${n} Fakten aus ${m} Dokument(en) extrahiert, ${facts.tables.length} Tabellen. FactSet ${factSetId}.`,
        en: `Extracted ${n} facts from ${m} document(s), ${facts.tables.length} tables. FactSet ${factSetId}.`,
      },
    };
  },
};
