import { explain } from '@passwerk/core';
import { z } from 'zod';
import { out, type ToolDefinition } from '../types.js';

const inputSchema = {
  id: z
    .string()
    .min(1)
    .describe(
      'A knowledge-base attribute id (e.g. "batteryChemistry") or a rule id (e.g. "PW-PLAUS-001")',
    ),
};

const outputSchema = out({
  kind: z.enum(['attribute', 'rule']).optional(),
  id: z.string().optional(),
  legalRefs: z.array(z.string()).optional(),
  legalRef: z.string().nullable().optional(),
  isNotLegalAdvice: z.literal(true).optional(),
});

export const explainAttributeTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'explain_attribute',
  title: 'Explain an attribute or rule',
  description:
    'Everything the knowledge base holds about one passport attribute (official DIN definition, DE/EN explanation, synonyms, who typically has the data, unit, range, applicability per category, legal references, IDTA template elements) or one plausibility rule (message, fix hint, legal reference). Nothing is composed; unknown ids are an error.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input) {
    const result = explain(input.id);
    if (!result) {
      return {
        isError: true,
        structured: { error: `Unknown id "${input.id}"` },
        text: {
          de: `Unbekannte Kennung "${input.id}". Attribut-Ids stehen in passwerk://reference/attributes, Regel-Ids in passwerk://reference/rules.`,
          en: `Unknown id "${input.id}". Attribute ids are listed in passwerk://reference/attributes, rule ids in passwerk://reference/rules.`,
        },
      };
    }
    if (result.kind === 'attribute') {
      const legal = result.legalRefs.length > 0 ? result.legalRefs.join('; ') : '-';
      const verify = result.verify
        ? { de: ' (Eintrag noch zu prüfen)', en: ' (entry still to verify)' }
        : { de: '', en: '' };
      return {
        structured: result,
        text: {
          de: `${result.name.de} (${result.id})${verify.de}: ${result.explanation.de} Wer hat die Daten: ${result.whoTypicallyHasIt.de}. Rechtsgrundlage: ${legal}. Keine Rechtsberatung.`,
          en: `${result.name.en} (${result.id})${verify.en}: ${result.explanation.en} Who has the data: ${result.whoTypicallyHasIt.en}. Legal basis: ${legal}. Not legal advice.`,
        },
      };
    }
    return {
      structured: result,
      text: {
        de: `${result.id} ${result.title.de}: ${result.message.de} Hinweis: ${result.fixHint.de} Rechtsgrundlage: ${result.legalRef ?? '-'}. Keine Rechtsberatung.`,
        en: `${result.id} ${result.title.en}: ${result.message.en} Hint: ${result.fixHint.en} Legal basis: ${result.legalRef ?? '-'}. Not legal advice.`,
      },
    };
  },
};
