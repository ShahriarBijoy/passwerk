import { type MappingProposal, type Provenance, suggestMappings } from '@passwerk/core';
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
  detail: z
    .enum(['summary', 'full'])
    .optional()
    .describe(
      'summary (default): header line plus the first 10 proposals, no provenance. full: every proposal after the filters, one line each, with provenance (file, page, cell); no cap',
    ),
  attributeIds: z
    .array(z.string())
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Keep only proposals for these attribute ids; unknown ids are reported, not an error. When given, the text lists every match, not just the first 10, with provenance, even in summary mode',
    ),
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
  counts: z.object({ total: z.number(), atLeast07: z.number(), listed: z.number() }).optional(),
});

function sourceText(sources: readonly Provenance[], lang: 'de' | 'en'): string {
  return sources
    .map((s) => {
      const parts = [s.file];
      if (s.page !== undefined) parts.push(`${lang === 'de' ? 'Seite' : 'page'} ${s.page}`);
      if (s.cell !== undefined) parts.push(`${lang === 'de' ? 'Zelle' : 'cell'} ${s.cell}`);
      return parts.join(' · ');
    })
    .join('; ');
}

function proposalLine(p: MappingProposal, lang: 'de' | 'en', withProvenance: boolean): string {
  const head = `${p.attributeId}${p.path ? `.${p.path}` : ''} = ${JSON.stringify(p.value)}${p.unit ? ` ${p.unit}` : ''} (${p.confidence.toFixed(2)})`;
  return withProvenance
    ? `- ${head} · ${sourceText(p.source, lang)} · ${p.why[lang]}`
    : `- ${head}: ${p.why[lang]}`;
}

export const suggestMappingsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'suggest_mappings',
  title: 'Suggest attribute mappings',
  description:
    'Scores every fact against the knowledge-base synonym index (DE/EN), unit and type checks and the attribute range, and returns candidate mappings sorted by confidence with a DE/EN explanation and provenance. Review proposals under 0.7 with the user or the source page, then pass the accepted ones to apply_mappings. Ask for detail "full", or pass attributeIds, to see every candidate with its file, page and cell in the text.',
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
    const proposedIds = new Set(all.map((p) => p.attributeId));
    const idFilter = input.attributeIds ? new Set(input.attributeIds) : null;
    const unknownIds = idFilter ? [...idFilter].filter((id) => !proposedIds.has(id)) : [];
    const proposals = all.filter(
      (p) => p.confidence >= min && (!idFilter || idFilter.has(p.attributeId)),
    );
    const atLeast07 = all.filter((p) => p.confidence >= 0.7).length;
    const fullList = input.detail === 'full' || idFilter !== null;
    const shown = fullList ? proposals : proposals.slice(0, 10);

    const header = (lang: 'de' | 'en') => {
      const filteredClause = idFilter
        ? lang === 'de'
          ? `; gefiltert auf ${idFilter.size} Attribute`
          : `; filtered to ${idFilter.size} attributes`
        : '';
      const base =
        lang === 'de'
          ? `${proposals.length} Vorschläge (${all.length} gesamt, ${atLeast07} mit Konfidenz >= 0,7${filteredClause}) für Kategorie ${input.category}.`
          : `${proposals.length} proposals (${all.length} total, ${atLeast07} at confidence >= 0.7${filteredClause}) for category ${input.category}.`;
      if (unknownIds.length === 0) return base;
      const unknownLine =
        lang === 'de'
          ? `${unknownIds.length} unbekannte Attribut-Ids ignoriert: ${unknownIds.join(', ')}`
          : `${unknownIds.length} unknown attribute ids ignored: ${unknownIds.join(', ')}`;
      return [base, unknownLine].join('\n');
    };

    return {
      structured: {
        factSetId,
        category: input.category,
        proposals,
        counts: { total: all.length, atLeast07, listed: shown.length },
      },
      text: {
        de: [header('de'), ...shown.map((p) => proposalLine(p, 'de', fullList))].join('\n'),
        en: [header('en'), ...shown.map((p) => proposalLine(p, 'en', fullList))].join('\n'),
      },
    };
  },
};
