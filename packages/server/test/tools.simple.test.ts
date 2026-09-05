import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SERVER_VERSION } from '../src/meta.ts';
import { TOOLS } from '../src/registry.ts';
import { call, connect } from './harness.ts';

let session: Awaited<ReturnType<typeof connect>>;
beforeAll(async () => {
  session = await connect();
});
afterAll(() => session.close());

describe('registry and createServer', () => {
  it('SERVER_VERSION equals package.json', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it('lists every registry tool with an output schema and a lang input', async () => {
    const { tools } = await session.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    for (const t of tools) {
      expect(t.outputSchema, t.name).toBeDefined();
      expect((t.inputSchema as { properties?: Record<string, unknown> }).properties).toHaveProperty(
        'lang',
      );
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(t.annotations?.openWorldHint).toBe(false);
    }
  });
});

describe('list_capabilities', () => {
  it('reports the bundle, the knowledge base and the server', async () => {
    const r = await call<{
      templates: unknown[];
      knowledgeBase: { attributes: number };
      server: { name: string; tools: string[]; session: { entries: number } };
      sovereignty: string;
    }>(session.client, 'list_capabilities');
    expect(r.isError).toBe(false);
    expect(r.structured.templates).toHaveLength(7);
    expect(r.structured.knowledgeBase.attributes).toBeGreaterThan(90);
    expect(r.structured.server.name).toBe('passwerk');
    expect(r.structured.server.tools).toEqual(TOOLS.map((t) => t.name));
    expect(r.structured.server.session.entries).toBe(0);
    expect(r.text).toContain('7 IDTA templates');
  });

  it('summarises in German on request and is byte-identical across calls', async () => {
    const de = await call(session.client, 'list_capabilities', { lang: 'de' });
    expect(de.text).toContain('Plausibilitätsregeln');
    const a = await call(session.client, 'list_capabilities');
    const b = await call(session.client, 'list_capabilities');
    expect(canonicalJson(a.structured)).toBe(canonicalJson(b.structured));
  });
});
