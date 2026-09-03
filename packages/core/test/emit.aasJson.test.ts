import { emitAasJson, PassportDraftError, samples } from '@passwerk/core';
import { templates } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const knownSemanticIds = new Set<string>();
for (const t of templates) {
  if (t.submodelSemanticId) knownSemanticIds.add(t.submodelSemanticId);
  for (const e of t.catalogue.elements) {
    if (e.semanticId) knownSemanticIds.add(e.semanticId);
    for (const s of e.supplementalSemanticIds) knownSemanticIds.add(s);
    if (e.listElement?.semanticIdListElement) {
      knownSemanticIds.add(e.listElement.semanticIdListElement);
    }
  }
  // Submodel-level supplemental ids come from the raw template headers.
  const raw = t.environment.submodels?.[0] as {
    supplementalSemanticIds?: { keys: { value: string }[] }[];
  };
  for (const r of raw.supplementalSemanticIds ?? []) {
    const key = r.keys[0];
    if (key) knownSemanticIds.add(key.value);
  }
}
const looksLikeSemanticId = (s: string) =>
  /^(urn:samm|https:\/\/admin-shell\.io|0112\/|0173-)/.test(s);

describe('emitAasJson', () => {
  for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const) {
    it(`${name}: valid, canonical, snapshot`, () => {
      const r = emitAasJson(samples[name]);
      expect(r.findings).toEqual([]);
      expect(r.verdict).toBe('valid');
      expect(r.output.endsWith('\n')).toBe(true);
      expect(r.output).toMatchSnapshot();
      const parsed = JSON.parse(r.output) as Record<string, unknown>;
      expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
      for (const m of r.output.matchAll(/"value": "([^"]+)"/g)) {
        const value = m[1] ?? '';
        if (looksLikeSemanticId(value)) expect(knownSemanticIds.has(value), value).toBe(true);
      }
    });
  }
  it('is byte-identical across runs', () => {
    expect(emitAasJson(samples['ev-valid']).output).toBe(emitAasJson(samples['ev-valid']).output);
  });
  it('carries the passport id as asset id', () => {
    const out = emitAasJson(samples['ev-valid']).output;
    expect(out).toContain(
      '"globalAssetId": "https://passport.musterwerk.example/battery/MW-EV-2026-000123"',
    );
  });
  it('emits with verdict invalid on value errors and throws on structural errors', () => {
    const broken = {
      ...samples['lmt-valid'],
      attributes: {
        ...samples['lmt-valid'].attributes,
        manufacturingDate: { value: '01.03.2026', status: 'present' },
      },
    };
    const r = emitAasJson(broken);
    expect(r.verdict).toBe('invalid');
    expect(r.output).toContain('"01.03.2026"');
    expect(() => emitAasJson({ meta: {}, attributes: {} })).toThrow(PassportDraftError);
  });
});
