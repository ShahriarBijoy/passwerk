import { listCapabilities } from '@passwerk/rules';
import { z } from 'zod';
import { SERVER_NAME, SERVER_VERSION, TRANSPORTS } from '../meta.js';
import { out, type ToolDefinition } from '../types.js';

const inputSchema = {};

const outputSchema = out({
  package: z.string().optional(),
  templates: z
    .array(z.looseObject({ part: z.number(), idta: z.string(), version: z.string() }))
    .optional(),
  aasSchemaVersions: z.array(z.string()).optional(),
  knowledgeBase: z
    .looseObject({ attributes: z.number(), plausibilityRules: z.number() })
    .optional(),
  sovereignty: z.string().optional(),
  server: z
    .looseObject({
      name: z.string(),
      version: z.string(),
      transports: z.array(z.string()),
      tools: z.array(z.string()),
      session: z.looseObject({ entries: z.number(), bytes: z.number() }),
    })
    .optional(),
});

/** Set by the registry after every tool is known, to avoid an import cycle. */
export let toolNames: readonly string[] = [];
export function setToolNames(names: readonly string[]): void {
  toolNames = names;
}

export const listCapabilitiesTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'list_capabilities',
  title: 'List capabilities',
  description:
    'Versions of the bundled IDTA 02035 templates and AAS schemas, knowledge-base statistics, when the artefacts were retrieved, the sovereignty statement, and this server’s tools and session-store usage. Call first to learn what this server can do.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(_input, ctx) {
    const caps = listCapabilities();
    const server = {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      transports: [...TRANSPORTS],
      tools: [...toolNames],
      session: ctx.store.stats(),
    };
    const kb = caps.knowledgeBase;
    return {
      structured: { ...caps, server },
      text: {
        de: `passwerk ${SERVER_VERSION}: ${caps.templates.length} IDTA-Templates, ${kb.attributes} Attribute (${kb.attributesToVerify} zu prüfen), ${kb.plausibilityRules} Plausibilitätsregeln, ${kb.timelineEvents} Termine. Artefakte abgerufen am ${caps.artefactsRetrievedAt}. Keine Netzwerk- oder Modellaufrufe.`,
        en: `passwerk ${SERVER_VERSION}: ${caps.templates.length} IDTA templates, ${kb.attributes} attributes (${kb.attributesToVerify} to verify), ${kb.plausibilityRules} plausibility rules, ${kb.timelineEvents} timeline events. Artefacts retrieved ${caps.artefactsRetrievedAt}. No network or model calls.`,
      },
    };
  },
};
