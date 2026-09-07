import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  BROKEN_SAMPLE_NAMES,
  brokenSamples,
  canonicalJson,
  getSample,
  samples,
  VALID_SAMPLE_NAMES,
} from '@passwerk/core';
import { attributes, plausibilityRules, templateCatalogue } from '@passwerk/rules';
import type { StoreKind } from '../session.js';
import type { ToolContext } from '../types.js';
import { cheatsheet } from './cheatsheet.js';

const JSON_MIME = 'application/json';

const json = (uri: string, value: unknown) => ({
  contents: [{ uri, mimeType: JSON_MIME, text: canonicalJson(value) }],
});

export const STATIC_RESOURCE_URIS = [
  'passwerk://samples',
  'passwerk://reference/attributes',
  'passwerk://reference/rules',
  'passwerk://reference/cheatsheet',
] as const;

export const TEMPLATE_RESOURCE_URIS = [
  'passwerk://samples/{name}',
  'passwerk://reference/template/{part}',
  'passwerk://session/{kind}/{id}',
] as const;

const comment = (draft: unknown): string =>
  typeof draft === 'object' && draft !== null && '$comment' in draft
    ? String((draft as { $comment: unknown }).$comment)
    : '';

export function sampleIndex() {
  return {
    valid: VALID_SAMPLE_NAMES.map((name) => ({
      name,
      category: samples[name].meta.category,
      description: comment(samples[name]),
    })),
    broken: BROKEN_SAMPLE_NAMES.map((name) => ({
      name,
      category: brokenSamples[name].draft.meta.category,
      expectedFindings: brokenSamples[name].expectedFindings,
      description: comment(brokenSamples[name].draft),
    })),
  };
}

export function attributeReference() {
  return attributes.map((a) => ({
    id: a.id,
    name: a.name,
    part: a.part,
    valueKind: a.valueKind,
    unit: a.unit,
    range: a.range,
    applicability: a.applicability,
    legalRefs: a.legalRefs,
    synonyms: a.synonyms,
    whoTypicallyHasIt: a.whoTypicallyHasIt,
    explanation: a.explanation,
    dynamic: a.dynamic,
    verify: a.verify,
  }));
}

export function templateReference(part: number) {
  const t = templateCatalogue.templates.find((x) => x.part === part);
  if (!t) return undefined;
  return {
    part: t.part,
    idta: t.idta,
    version: t.version,
    submodelIdShort: t.submodelIdShort,
    submodelSemanticId: t.submodelSemanticId,
    elements: t.elements.map((e) => ({
      path: e.path,
      idShort: e.idShort,
      modelType: e.modelType,
      semanticId: e.semanticId,
      cardinality: e.cardinality,
      valueType: e.valueType,
      exampleValue: e.exampleValue,
    })),
  };
}

const STORE_KINDS: Record<string, StoreKind> = { bundle: 'bundle', facts: 'facts', draft: 'draft' };

export function registerResources(server: McpServer, ctx: ToolContext): void {
  server.registerResource(
    'samples',
    'passwerk://samples',
    {
      title: 'Golden samples',
      description:
        'Names of the valid and broken golden PassportDrafts with their expected findings',
      mimeType: JSON_MIME,
    },
    async (uri) => json(uri.href, sampleIndex()),
  );

  server.registerResource(
    'sample',
    new ResourceTemplate('passwerk://samples/{name}', {
      list: async () => ({
        resources: [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES].map((name) => ({
          uri: `passwerk://samples/${name}`,
          name,
          mimeType: JSON_MIME,
        })),
      }),
    }),
    {
      title: 'Golden sample draft',
      description: 'One golden PassportDraft, e.g. ev-valid or lmt-missing-state-of-charge',
      mimeType: JSON_MIME,
    },
    async (uri, { name }) => {
      const n = String(name);
      const all: readonly string[] = [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES];
      if (!all.includes(n)) throw new Error(`Unknown sample "${n}". See passwerk://samples`);
      return json(uri.href, getSample(n as (typeof VALID_SAMPLE_NAMES)[number]));
    },
  );

  server.registerResource(
    'attributes',
    'passwerk://reference/attributes',
    {
      title: 'Attribute knowledge base',
      description:
        'Every passport attribute: id, DE/EN name, value kind, unit, range, applicability per category, legal references, synonyms, who typically has the data',
      mimeType: JSON_MIME,
    },
    async (uri) => json(uri.href, attributeReference()),
  );

  server.registerResource(
    'rules',
    'passwerk://reference/rules',
    {
      title: 'Plausibility rules',
      description:
        'The PW-PLAUS catalogue: id, severity, DE/EN title, message, fix hint, attributes, legal reference',
      mimeType: JSON_MIME,
    },
    async (uri) => json(uri.href, plausibilityRules),
  );

  server.registerResource(
    'cheatsheet',
    'passwerk://reference/cheatsheet',
    {
      title: 'Cheat sheet',
      description:
        'One page, DE and EN: categories, key dates, mandatory counts, workflow order, confidence rule',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: cheatsheet() }],
    }),
  );

  server.registerResource(
    'template',
    new ResourceTemplate('passwerk://reference/template/{part}', {
      list: async () => ({
        resources: templateCatalogue.templates.map((t) => ({
          uri: `passwerk://reference/template/${t.part}`,
          name: `${t.idta} ${t.submodelIdShort}`,
          mimeType: JSON_MIME,
        })),
      }),
    }),
    {
      title: 'IDTA 02035 template structure',
      description:
        'The catalogue of one part (1 to 7): path, idShort, semanticId, cardinality, value type',
      mimeType: JSON_MIME,
    },
    async (uri, { part }) => {
      const ref = templateReference(Number(part));
      if (!ref) throw new Error(`Unknown template part "${String(part)}". Parts are 1 to 7`);
      return json(uri.href, ref);
    },
  );

  server.registerResource(
    'session',
    new ResourceTemplate('passwerk://session/{kind}/{id}', { list: undefined }),
    {
      title: 'Session object',
      description:
        'A stored bundle, facts or draft by the id a tool returned (this connection only)',
      mimeType: JSON_MIME,
    },
    async (uri, { kind, id }) => {
      const k = STORE_KINDS[String(kind)];
      if (!k) throw new Error(`Unknown session kind "${String(kind)}". Use bundle, facts or draft`);
      const value = ctx.store.get(k, String(id));
      if (value === undefined) {
        throw new Error(`Unknown ${k} id "${String(id)}". Ids live for one connection.`);
      }
      return json(uri.href, value);
    },
  );
}
