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
import { initialState, type WorkflowState } from '@/workflow/state.ts';

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

/** `ev-valid` with a raw string where core expects a list of materials. */
function brokenBase(): PassportDraft {
  const draft = structuredClone(getSample('ev-valid')) as PassportDraft;
  const attributes = draft.attributes as Record<string, { value: unknown }>;
  const field = attributes['criticalRawMaterials'];
  if (!field) throw new Error('ev-valid should carry criticalRawMaterials');
  field.value = 'lithium, cobalt';
  return draft;
}

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

  it('a decision only validate refuses is reported, not thrown', () => {
    // A raw string where core expects a list of materials. `applyMappings` waves a whole
    // composite through (its shape is L1's business), and `validate` then walks the value and
    // throws. Built straight into the state, the way a stale autosave would arrive.
    const s: WorkflowState = {
      ...withProposals,
      decisions: {
        criticalRawMaterials: {
          kind: 'manual',
          attributeId: 'criticalRawMaterials',
          value: 'Lithium, Kobalt',
        },
        'batteryChemistry#clearName': {
          kind: 'manual',
          attributeId: 'batteryChemistry',
          path: 'clearName',
          value: 'Lithium nickel manganese cobalt oxide',
        },
      },
    };
    const d = derive(s, AT);
    expect(d?.invalidDecisions.map((x) => x.key)).toEqual(['criticalRawMaterials']);
    expect(d?.draft.attributes['criticalRawMaterials']).toBeUndefined();
    expect(d?.draft.attributes['batteryChemistry']?.value).toEqual({
      clearName: 'Lithium nickel manganese cobalt oxide',
    });
    expect(d?.report.verdict).toBe('invalid');
  });

  it('an imported base draft that core cannot validate is reported, not thrown', () => {
    // A whole-composite string reaches `importDraftJson` because L1 still returns a draft
    // alongside its PW-L1-VALUE error, and `importDraft` clears the decisions, so there is no
    // decision to blame: the base alone makes `validate` throw.
    const s = reduce(initialState, { type: 'importDraft', draft: brokenBase(), at: AT });
    const d = derive(s, AT);
    expect(d?.report.verdict).toBe('invalid');
    expect(d?.report.findings.filter((f) => f.layer === 'L1').length).toBeGreaterThan(0);
    expect(d?.report.layers.L1.ran).toBe(true);
    expect(d?.report.layers.L2.ran).toBe(false);
    expect(d?.report.layers.L3.ran).toBe(false);
    expect(d?.report.layers.L4.ran).toBe(false);
  });

  it('decisions still apply on top of a base draft core cannot validate', () => {
    const base = reduce(initialState, { type: 'importDraft', draft: brokenBase(), at: AT });
    const s = reduce(base, {
      type: 'decide',
      decision: { kind: 'manual', attributeId: 'ratedCapacity', value: '99.9', unit: 'Ah' },
      at: AT,
    });
    const d = derive(s, AT);
    // The base is what validation trips over, so a clean decision is not blamed for it.
    expect(d?.invalidDecisions).toEqual([]);
    expect(d?.draft.attributes['ratedCapacity']?.value).toBe('99.9');
    // Still nothing but L1 has walked this draft, so the report may not claim more.
    expect(d?.report.verdict).toBe('invalid');
    expect(d?.report.layers.L1.ran).toBe(true);
    expect(d?.report.layers.L2.ran).toBe(false);
  });

  it('blames a decision that breaks a state an earlier decision had repaired', () => {
    // Decisions fold in sorted key order: `criticalRawMaterials` repairs the base, and
    // `hazardousSubstances` then breaks validation again. The second one is blameable
    // precisely because the first one made the draft validatable.
    const sample = structuredClone(getSample('ev-valid')) as PassportDraft;
    const repaired = (sample.attributes as Record<string, { value: unknown }>)[
      'criticalRawMaterials'
    ]?.value;
    const s: WorkflowState = {
      ...reduce(initialState, { type: 'importDraft', draft: brokenBase(), at: AT }),
      decisions: {
        criticalRawMaterials: {
          kind: 'manual',
          attributeId: 'criticalRawMaterials',
          // Core's mapping value is `unknown`; only the UI is limited to strings.
          value: repaired as string,
        },
        hazardousSubstances: {
          kind: 'manual',
          attributeId: 'hazardousSubstances',
          value: 'kaputt',
        },
      },
    };
    const d = derive(s, AT);
    expect(d?.invalidDecisions.map((x) => x.key)).toEqual(['hazardousSubstances']);
    expect(d?.draft.attributes['criticalRawMaterials']?.value).toEqual(repaired);
    // The blamed decision's draft is discarded, not merged behind a stale report.
    expect(d?.draft.attributes['hazardousSubstances']?.value).not.toBe('kaputt');
    expect(Array.isArray(d?.draft.attributes['hazardousSubstances']?.value)).toBe(true);
    expect(d?.report.verdict).toBe('valid');
    expect(d?.report.layers.L2.ran).toBe(true);
  });

  it('an imported golden sample validates as core says', () => {
    const draft = getSample('ev-valid') as PassportDraft;
    const s = reduce(initialState, { type: 'importDraft', draft, at: AT });
    expect(derive(s, AT)?.report.verdict).toBe('valid');
    const broken = getSample('lmt-wrong-date-format') as PassportDraft;
    const b = reduce(initialState, { type: 'importDraft', draft: broken, at: AT });
    expect(derive(b, AT)?.report.verdict).toBe('invalid');
  });

  it('a reviewer-supplied recordedAt reaches the mapping and satisfies PW-PLAUS-011', () => {
    const draft = structuredClone(getSample('ev-valid')) as PassportDraft;
    delete (draft.attributes as Record<string, unknown>)['stateOfCharge'];
    const base = reduce(initialState, { type: 'importDraft', draft, at: AT });
    const decision = { kind: 'manual', attributeId: 'stateOfCharge', value: '80' } as const;

    const unstamped = reduce(base, { type: 'decide', decision, at: AT });
    expect(derive(unstamped, AT)?.report.findings.map((f) => f.ruleId)).toContain('PW-PLAUS-011');

    const stamped = reduce(base, {
      type: 'decide',
      decision: { ...decision, recordedAt: '2026-09-04T10:00:00.000Z' },
      at: AT,
    });
    expect(decisionsToMappings(stamped)).toEqual([
      {
        attributeId: 'stateOfCharge',
        value: '80',
        recordedAt: '2026-09-04T10:00:00.000Z',
        override: true,
      },
    ]);
    const d = derive(stamped, AT);
    expect(d?.draft.attributes['stateOfCharge']?.recordedAt).toBe('2026-09-04T10:00:00.000Z');
    expect(d?.report.findings.map((f) => f.ruleId)).not.toContain('PW-PLAUS-011');
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
