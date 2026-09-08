import { gapReport, validate } from '@passwerk/core';
import { z } from 'zod';
import { DraftRef, FactsRef, resolveDraft, resolveFacts } from '../refs.js';
import { gapSummary, validationSummary } from '../summary.js';
import { FindingSchema, type LangText, out, type ToolDefinition } from '../types.js';
import { WORKBENCH_URI } from '../ui.js';

const inputSchema = {
  draft: DraftRef.optional().describe('The draft to review; omit to open an empty workbench'),
  facts: FactsRef.optional().describe('Extracted facts to review alongside the draft'),
};

const outputSchema = out({
  draftId: z.string().optional(),
  draft: z.looseObject({ meta: z.looseObject({}) }).optional(),
  factSetId: z.string().optional(),
  facts: z.looseObject({ facts: z.array(z.looseObject({})) }).optional(),
  report: z
    .looseObject({
      verdict: z.enum(['valid', 'valid_with_warnings', 'invalid']),
      findings: z.array(FindingSchema),
    })
    .optional(),
  gap: z.looseObject({ items: z.array(z.looseObject({})) }).optional(),
});

const OPENED: LangText = {
  de: 'Werkbank geöffnet. Laden Sie Dokumente hoch oder importieren Sie einen Entwurf in der Werkbank.',
  en: 'Workbench opened. Upload documents or import a draft in the workbench.',
};

/**
 * The twelfth tool (ADR D-037). In hosts that render MCP Apps its result is shown by the
 * workbench resource; everywhere else it is a plain read of draft, report and gap.
 */
export const reviewPassportTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'review_passport',
  title: 'Review a passport in the workbench',
  description:
    'Opens the interactive passwerk workbench in hosts that render MCP Apps (Claude Desktop, Claude web): upload documents, accept or edit mapping proposals, read the gap report and export, all on the user’s machine. Pass the current draft so the user reviews it visually; the workbench keeps the draft id in sync so gap_report and emit_passport can continue on it. Hosts without a UI receive the same draft, validation report and gap report as text.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  ui: { resourceUri: WORKBENCH_URI },
  async handler(input, ctx) {
    const structured: Record<string, unknown> = {};
    const de: string[] = [];
    const en: string[] = [];
    if (input.draft !== undefined) {
      const { draft, draftId } = await resolveDraft(input.draft, ctx);
      const { aasJson: _aasJson, ...report } = validate(draft, { asOf: ctx.clock });
      const gap = gapReport(draft, { report, asOf: ctx.clock });
      Object.assign(structured, { draftId, draft, report, gap });
      const v = validationSummary(report);
      const g = gapSummary(gap);
      de.push(v.de, g.de);
      en.push(v.en, g.en);
    }
    if (input.facts !== undefined) {
      const { facts, factSetId } = await resolveFacts(input.facts, ctx);
      Object.assign(structured, { factSetId, facts });
      de.push(`${facts.facts.length} Fakten übergeben (${factSetId}).`);
      en.push(`${facts.facts.length} facts passed (${factSetId}).`);
    }
    if (de.length === 0) return { structured, text: OPENED };
    return { structured, text: { de: de.join('\n'), en: en.join('\n') } };
  },
};
