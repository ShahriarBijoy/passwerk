import { applyMappings, MappingDecision, newDraft, SCHEMA_VERSION } from '@passwerk/core';
import { BATTERY_CATEGORIES } from '@passwerk/rules';
import { z } from 'zod';
import { DraftRef, resolveDraft } from '../refs.js';
import { out, type ToolDefinition } from '../types.js';

const inputSchema = {
  draft: DraftRef.optional().describe('The draft to extend. Omit and pass meta to start a new one'),
  meta: z
    .object({
      category: z.enum(BATTERY_CATEGORIES),
      passportId: z.string().min(1).describe('The battery passport identifier, a URI (URL or URN)'),
      createdAt: z.string().optional().describe('ISO date-time; default: the server clock'),
    })
    .optional()
    .describe('Starts a new draft. Exactly one of draft or meta'),
  mappings: z
    .array(
      z.looseObject({
        attributeId: z.string().min(1),
        value: z.unknown(),
        unit: z.string().optional(),
        path: z.string().optional().describe('Composite leaf path, e.g. "name.de"'),
        source: z.array(z.looseObject({ file: z.string() })).optional(),
        confidence: z.number().optional(),
        override: z
          .boolean()
          .optional()
          .describe('Replace an existing different value instead of flagging a conflict'),
      }),
    )
    .describe('Accepted proposals from suggest_mappings, or manual values'),
};

const outputSchema = out({
  draftId: z.string().optional(),
  draft: z.looseObject({ meta: z.looseObject({}) }).optional(),
  applied: z.number().optional(),
  conflicts: z.array(z.looseObject({ attributeId: z.string() })).optional(),
});

export const applyMappingsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'apply_mappings',
  title: 'Apply mapping decisions',
  description:
    'Folds accepted mapping decisions (or manual values) into a PassportDraft. Idempotent: the same decision twice is a no-op; a different value for an attribute that already has one is reported as a conflict and not applied unless override is true. Pass meta instead of draft to start a new draft.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input, ctx) {
    if ((input.draft === undefined) === (input.meta === undefined)) {
      const message = 'Provide either draft or meta, not both and not neither';
      return {
        isError: true,
        structured: { error: message },
        text: {
          de: 'Entweder draft oder meta angeben, nicht beides und nicht keines.',
          en: message,
        },
      };
    }
    const base = input.meta
      ? newDraft({
          schemaVersion: SCHEMA_VERSION,
          category: input.meta.category,
          passportId: input.meta.passportId,
          createdAt: input.meta.createdAt ?? ctx.clock,
        })
      : (await resolveDraft(input.draft, ctx)).draft;
    const decisions = z.array(MappingDecision).parse(input.mappings);
    const result = applyMappings(base, decisions);
    const draftId = await ctx.store.put('draft', result.draft);
    const conflictLines = (lang: 'de' | 'en') =>
      result.conflicts.map((c) =>
        lang === 'de'
          ? `- ${c.attributeId}${c.path ? `.${c.path}` : ''}: vorhanden ${JSON.stringify(c.existing)}, neu ${JSON.stringify(c.incoming)}`
          : `- ${c.attributeId}${c.path ? `.${c.path}` : ''}: existing ${JSON.stringify(c.existing)}, incoming ${JSON.stringify(c.incoming)}`,
      );
    return {
      structured: { draftId, ...result },
      text: {
        de: [
          `${result.applied} Entscheidungen übernommen, ${result.conflicts.length} Konflikte. Entwurf ${draftId}.`,
          ...conflictLines('de'),
        ].join('\n'),
        en: [
          `Applied ${result.applied} decisions, ${result.conflicts.length} conflicts. Draft ${draftId}.`,
          ...conflictLines('en'),
        ].join('\n'),
      },
    };
  },
};
