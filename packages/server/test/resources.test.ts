import { canonicalJson, getSample } from '@passwerk/core';
import { timeline } from '@passwerk/rules';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STATIC_RESOURCE_URIS, TEMPLATE_RESOURCE_URIS } from '../src/resources/index.ts';
import { call, connect } from './harness.ts';

let session: Awaited<ReturnType<typeof connect>>;
beforeAll(async () => {
  session = await connect();
});
afterAll(() => session.close());

const read = async (uri: string): Promise<string> => {
  const r = await session.client.readResource({ uri });
  const first = r.contents[0];
  expect(first?.uri).toBe(uri);
  return (first as { text: string }).text;
};

describe('resources', () => {
  it('lists the static resources and the templates', async () => {
    const { resources } = await session.client.listResources();
    for (const uri of STATIC_RESOURCE_URIS) expect(resources.map((r) => r.uri)).toContain(uri);
    // Templates with a list callback contribute their concrete URIs too.
    expect(resources.map((r) => r.uri)).toContain('passwerk://samples/ev-valid');
    expect(resources.map((r) => r.uri)).toContain('passwerk://reference/template/1');
    const { resourceTemplates } = await session.client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate).sort()).toEqual(
      [...TEMPLATE_RESOURCE_URIS].sort(),
    );
  });

  it('samples index and a sample draft', async () => {
    const index = JSON.parse(await read('passwerk://samples')) as {
      valid: { name: string }[];
      broken: { name: string; expectedFindings: string[] }[];
    };
    expect(index.valid.map((s) => s.name)).toContain('ev-valid');
    expect(index.broken.every((s) => s.expectedFindings.length > 0)).toBe(true);
    const draft = await read('passwerk://samples/ev-valid');
    expect(draft).toBe(canonicalJson(getSample('ev-valid')));
    await expect(read('passwerk://samples/nope')).rejects.toThrow(/Unknown sample/);
  });

  it('attribute and rule references carry both languages and legal references', async () => {
    const attrs = JSON.parse(await read('passwerk://reference/attributes')) as {
      id: string;
      name: { de: string; en: string };
      legalRefs: string[];
      synonyms: { de: string[]; en: string[] };
    }[];
    expect(attrs.length).toBeGreaterThan(90);
    for (const a of attrs) {
      expect(a.name.de, a.id).toBeTruthy();
      expect(a.name.en, a.id).toBeTruthy();
      expect(Array.isArray(a.legalRefs), a.id).toBe(true);
    }
    const rules = JSON.parse(await read('passwerk://reference/rules')) as { id: string }[];
    expect(rules.length).toBeGreaterThan(20);
    expect(rules.every((r) => r.id.startsWith('PW-PLAUS-'))).toBe(true);
  });

  it('the cheat sheet is generated from the knowledge base in both languages', async () => {
    const md = await read('passwerk://reference/cheatsheet');
    expect(md).toContain('## Deutsch');
    expect(md).toContain('## English');
    for (const e of timeline.events) expect(md).toContain(e.date);
    expect(md).toContain('2027-02-18');
    expect(md).toContain('isNotLegalAdvice');
    expect(md).toContain('check_obligations');
  });

  it('template parts resolve and unknown parts fail', async () => {
    const t = JSON.parse(await read('passwerk://reference/template/1')) as {
      part: number;
      elements: { path: string; semanticId: string | null }[];
    };
    expect(t.part).toBe(1);
    expect(t.elements.length).toBeGreaterThan(5);
    expect(t.elements.every((e) => e.path.startsWith('1/'))).toBe(true);
    await expect(read('passwerk://reference/template/9')).rejects.toThrow(/Unknown template part/);
  });

  it('session objects are readable by the id a tool returned', async () => {
    const r = await call<{ draftId: string }>(session.client, 'validate_passport', {
      draft: getSample('lmt-valid'),
    });
    const stored = await read(`passwerk://session/draft/${r.structured.draftId}`);
    expect(JSON.parse(stored)).toHaveProperty('meta.category', 'LMT');
    await expect(read('passwerk://session/draft/drf_0000000000000000')).rejects.toThrow(
      /Unknown draft id/,
    );
    await expect(read('passwerk://session/nope/x')).rejects.toThrow(/Unknown session kind/);
  });
});
