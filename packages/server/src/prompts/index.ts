import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Lang } from '../types.js';
import { auditSupplierSubmission, buildPassportInterview, draftDataRequest } from './texts.js';

const asLang = (value: string | undefined): Lang => (value === 'de' ? 'de' : 'en');

const message = (text: string) => ({
  messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
});

export const PROMPT_NAMES = [
  'build-passport-interview',
  'audit-supplier-submission',
  'draft-data-request',
] as const;

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'build-passport-interview',
    {
      title: 'Build a battery passport',
      description:
        'Guided flow: confirm obligations and category, ingest documents, review mappings, validate, fix, gap report, emit.',
      argsSchema: {
        category: z
          .string()
          .optional()
          .describe('EV, LMT or INDUSTRIAL_GT_2KWH when already known'),
        lang: z.string().optional().describe('de or en'),
      },
    },
    ({ category, lang }) => message(buildPassportInterview(asLang(lang), category)),
  );
  server.registerPrompt(
    'audit-supplier-submission',
    {
      title: 'Audit a supplier submission',
      description:
        'For an OEM or Tier-1 receiving a draft: validate, gap report, then accept, return or reject with rationale.',
      argsSchema: { lang: z.string().optional().describe('de or en') },
    },
    ({ lang }) => message(auditSupplierSubmission(asLang(lang))),
  );
  server.registerPrompt(
    'draft-data-request',
    {
      title: 'Draft an upstream data request',
      description:
        'Turns the gap report into the request a supplier sends upstream, grouped by data owner with legal references.',
      argsSchema: { lang: z.string().optional().describe('de or en') },
    },
    ({ lang }) => message(draftDataRequest(asLang(lang))),
  );
}
