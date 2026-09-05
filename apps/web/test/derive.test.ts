import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalJson,
  extractFacts,
  getSample,
  ingest,
  type MappingProposal,
  type PassportDraft,
  SCHEMA_VERSION,
  suggestMappings,
} from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { decisionsToMappings, derive } from '@/workflow/derive.ts';
import { reduce } from '@/workflow/reducer.ts';
import { initialState } from '@/workflow/state.ts';

const AT = '2026-09-05T12:00:00Z';
const FIX = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'packages',
  'core',
  'test',
  'fixtures',
  'musterwerk',
);
const META = {
  schemaVersion: SCHEMA_VERSION,
  category: 'EV' as const,
  createdAt: AT,
  passportId: 'urn:passwerk:test:1',
};

let withProposals = initialState;
beforeAll(async () => {
  const names = ['lieferantenerklaerung.pdf', 'stueckliste.xlsx', 'datasheet-en.csv'];
  const bundle = await ingest(
    names.map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(FIX, name))) })),
  );
  const facts = extractFacts(bundle);
  withProposals = reduce(reduce(initialState, { type: 'startProject', meta: META, at: AT }), {
    type: 'filesIngested',
    summaries: [],
    facts,
    proposals: suggestMappings(facts, { category: 'EV' }),
    at: AT,
  });
}, 60_000);

describe('derive', () => {
  it('returns null without a base draft', () => {
    expect(derive(initialState, AT)).toBeNull();
  });

  it('accepted proposals land in the draft with their provenance; rejected ones do not', () => {
    const candidates = withProposals.proposals.filter(
      (p) => p.confidence >= 0.7 && p.path === undefined,
    );
    const a = candidates[0];
    const b = candidates.find((p) => p.attributeId !== a?.attributeId);
    if (!a || !b) throw new Error('need two proposals');
    let s = reduce(withProposals, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: a.attributeId, factId: a.factId },
      at: AT,
    });
    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'reject', attributeId: b.attributeId, factId: b.factId },
      at: AT,
    });
    const d = derive(s, AT);
    expect(d?.draft.attributes[a.attributeId]?.value).toBe(a.value);
    expect(d?.draft.attributes[a.attributeId]?.source).toEqual(a.source);
    expect(d?.draft.attributes[b.attributeId]).toBeUndefined();
  });

  it('edit keeps the provenance and replaces the value; manual carries none', () => {
    const p = withProposals.proposals.find((x) => x.confidence >= 0.7 && x.path === undefined);
    if (!p) throw new Error('need a proposal');
    let s = reduce(withProposals, {
      type: 'decide',
      decision: {
        kind: 'edit',
        attributeId: p.attributeId,
        factId: p.factId,
        value: '1',
        ...(p.unit ? { unit: p.unit } : {}),
      },
      at: AT,
    });
    s = reduce(s, {
      type: 'decide',
      decision: {
        kind: 'manual',
        attributeId: 'batteryChemistry',
        path: 'clearName',
        value: 'Lithium nickel manganese cobalt oxide',
      },
      at: AT,
    });
    const mappings = decisionsToMappings(s);
    expect(mappings.find((m) => m.attributeId === p.attributeId)).toMatchObject({
      value: '1',
      source: p.source,
      override: true,
    });
    expect(mappings.find((m) => m.attributeId === 'batteryChemistry')).toEqual({
      attributeId: 'batteryChemistry',
      path: 'clearName',
      value: 'Lithium nickel manganese cobalt oxide',
      override: true,
    });
  });

  it('is byte-identical on re-run and memoised per state', () => {
    const d1 = derive(withProposals, AT);
    const d2 = derive(withProposals, AT);
    expect(d1).toBe(d2);
    const again = derive({ ...withProposals }, AT);
    expect(canonicalJson(again?.report)).toBe(canonicalJson(d1?.report));
    expect(canonicalJson(again?.gap)).toBe(canonicalJson(d1?.gap));
  });

  it('a decision core rejects is reported, not thrown; the rest still apply', () => {
    const bad = {
      attributeId: 'ratedCapacity',
      value: '94.5',
      unit: 'Ah',
      factId: 'bad-1',
      confidence: 0.9,
      source: [{ file: 'a.pdf', page: 1 }],
      why: { de: 'Treffer', en: 'Match' },
      checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' },
    } satisfies MappingProposal;
    const base = { ...withProposals, proposals: [...withProposals.proposals, bad] };
    let s = reduce(base, {
      type: 'decide',
      decision: {
        kind: 'edit',
        attributeId: 'ratedCapacity',
        factId: 'bad-1',
        value: '94,5',
        unit: 'Ah',
      },
      at: AT,
    });
    s = reduce(s, {
      type: 'decide',
      decision: {
        kind: 'manual',
        attributeId: 'batteryChemistry',
        path: 'clearName',
        value: 'Lithium nickel manganese cobalt oxide',
      },
      at: AT,
    });
    const d = derive(s, AT);
    expect(d?.invalidDecisions.map((x) => x.key)).toEqual(['ratedCapacity']);
    expect(d?.invalidDecisions[0]?.message).toContain('ratedCapacity');
    expect(d?.draft.attributes['batteryChemistry']?.value).toEqual({
      clearName: 'Lithium nickel manganese cobalt oxide',
    });
    expect(d?.draft.attributes['ratedCapacity']).toBeUndefined();
  });

  it('an imported golden sample validates as core says', () => {
    const draft = getSample('ev-valid') as PassportDraft;
    const s = reduce(initialState, { type: 'importDraft', draft, at: AT });
    expect(derive(s, AT)?.report.verdict).toBe('valid');
    const broken = getSample('lmt-wrong-date-format') as PassportDraft;
    const b = reduce(initialState, { type: 'importDraft', draft: broken, at: AT });
    expect(derive(b, AT)?.report.verdict).toBe('invalid');
  });

  it('an imported draft with a conflict field yields invalid', () => {
    const draft = structuredClone(getSample('ev-valid')) as PassportDraft;
    const attrs = draft.attributes as Record<string, { status: string } | undefined>;
    const id = Object.keys(attrs).sort()[0];
    const field = id === undefined ? undefined : attrs[id];
    if (!field) throw new Error('need an attribute to mark as a conflict');
    field.status = 'conflict';
    const s = reduce(initialState, { type: 'importDraft', draft, at: AT });
    expect(derive(s, AT)?.report.verdict).toBe('invalid');
  });
});
