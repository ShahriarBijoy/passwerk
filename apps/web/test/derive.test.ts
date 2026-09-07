import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalJson,
  extractFacts,
  type FactSet,
  getSample,
  ingest,
  type PassportDraft,
  suggestMappings,
} from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { derive } from '@/workflow/derive/index.ts';
import { defaultProject } from '@/workflow/project.ts';
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
const PROJECT = defaultProject('urn:passwerk:test:1', '');

let facts: FactSet = { facts: [], tables: [], documents: [] };
let withFacts: WorkflowState = initialState;
beforeAll(async () => {
  const names = ['lieferantenerklaerung.pdf', 'stueckliste.xlsx', 'datasheet-en.csv'];
  const bundle = await ingest(
    names.map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(FIX, name))) })),
  );
  facts = extractFacts(bundle);
  withFacts = reduce(reduce(initialState, { type: 'setProject', project: PROJECT, at: AT }), {
    type: 'filesIngested',
    summaries: [],
    facts,
    at: AT,
  });
}, 60_000);

const must = (d: ReturnType<typeof derive>) => {
  if (!d) throw new Error('expected a derived bundle');
  return d;
};

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
  it('is null without a project and null while the project has no meta', () => {
    expect(derive(initialState, AT)).toBeNull();
    const noCategory = reduce(initialState, {
      type: 'setProject',
      project: { ...PROJECT, batteryType: 'PORTABLE' },
      at: AT,
    });
    expect(derive(noCategory, AT)).toBeNull();
  });
  it('proposals come from facts and the derived category, exactly as core proposes', () => {
    const d = must(derive(withFacts, AT));
    expect(d.proposals).toEqual(suggestMappings(facts, { category: 'EV' }));
    expect(d.meta.category).toBe('EV');
    expect(d.draft.meta).toEqual(d.meta);
  });
  it('a battery type change re-proposes; a stranded decision is ignored and revived', () => {
    const first = must(derive(withFacts, AT)).proposals[0];
    if (!first) throw new Error('expected proposals');
    const decided = reduce(withFacts, {
      type: 'decide',
      decision: {
        kind: 'accept',
        attributeId: first.attributeId,
        ...(first.path ? { path: first.path } : {}),
        factId: first.factId,
      },
      at: AT,
    });
    expect(must(derive(decided, AT)).draft.attributes[first.attributeId]?.status).toBe('present');
    const lmt = reduce(decided, {
      type: 'setProject',
      project: { ...PROJECT, batteryType: 'LMT' },
      at: AT,
    });
    const dl = must(derive(lmt, AT));
    expect(dl.proposals).toEqual(suggestMappings(facts, { category: 'LMT' }));
    expect(dl.invalidDecisions).toEqual([]);
    const back = reduce(lmt, {
      type: 'setProject',
      project: { ...PROJECT, batteryType: 'EV' },
      at: AT,
    });
    expect(must(derive(back, AT)).draft.attributes[first.attributeId]?.status).toBe('present');
  });
  it('a fact edit reaches the proposal and the draft', () => {
    const first = must(derive(withFacts, AT)).proposals.find(
      (p) => p.path === undefined && typeof p.value === 'string',
    );
    if (!first) throw new Error('expected a scalar proposal');
    const edited = reduce(withFacts, {
      type: 'editFact',
      factId: first.factId,
      edit: { value: '42', ...(first.unit ? { unit: first.unit } : {}) },
      at: AT,
    });
    const accepted = reduce(edited, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: first.attributeId, factId: first.factId },
      at: AT,
    });
    const d = must(derive(accepted, AT));
    expect(d.facts.facts.find((f) => f.id === first.factId)?.value).toBe('42');
    expect(
      d.proposals.find((p) => p.factId === first.factId && p.attributeId === first.attributeId)
        ?.value,
    ).toBe('42');
    const field = d.draft.attributes[first.attributeId] as { value?: unknown } | undefined;
    expect(field?.value).toBe('42');
  });
  it("a manual decision with a factId carries that fact's provenance", () => {
    const fact = facts.facts[0];
    if (!fact) throw new Error('expected facts');
    const s = reduce(withFacts, {
      type: 'decide',
      decision: {
        kind: 'manual',
        attributeId: 'nominalVoltage',
        value: '400',
        unit: 'V',
        factId: fact.id,
      },
      at: AT,
    });
    const field = must(derive(s, AT)).draft.attributes['nominalVoltage'] as
      | { source?: unknown }
      | undefined;
    expect(field?.source).toEqual([fact.source]);
  });
  it("imports a draft, replaces its meta with the project's and validates it", () => {
    const draft = getSample('ev-valid') as PassportDraft;
    const s = reduce(initialState, { type: 'importDraft', draft, at: AT });
    const d = must(derive(s, AT));
    expect(d.report.verdict).toBe('valid');
    expect(d.draft.meta).toEqual(draft.meta);
    expect(d.carrier.ok).toBe(true);
  });
  it('an imported draft with a conflict field yields invalid', () => {
    const draft = structuredClone(getSample('ev-valid')) as PassportDraft;
    (draft.attributes as Record<string, { status: string }>)['nominalVoltage'] = {
      ...(draft.attributes as Record<string, object>)['nominalVoltage'],
      status: 'conflict',
    } as never;
    const d = must(derive(reduce(initialState, { type: 'importDraft', draft, at: AT }), AT));
    expect(d.report.verdict).toBe('invalid');
  });
  it('isolates a decision core cannot walk and keeps the rest', () => {
    const s = reduce(
      reduce(initialState, {
        type: 'importDraft',
        draft: getSample('ev-valid') as PassportDraft,
        at: AT,
      }),
      {
        type: 'decide',
        decision: { kind: 'manual', attributeId: 'criticalRawMaterials', value: 'lithium' },
        at: AT,
      },
    );
    const d = must(derive(s, AT));
    expect(d.invalidDecisions.map((i) => i.key)).toEqual(['criticalRawMaterials']);
    expect(d.report.verdict).toBe('valid');
  });
  it('reports L1 alone for an imported draft no validator can walk', () => {
    const d = must(
      derive(reduce(initialState, { type: 'importDraft', draft: brokenBase(), at: AT }), AT),
    );
    expect(d.report.verdict).toBe('invalid');
    expect(d.report.layers.L1.ran).toBe(true);
    expect(d.report.layers.L4.ran).toBe(false);
  });
  it('is byte-identical on re-run and reuses every object across a language toggle', () => {
    const a = must(derive(withFacts, AT));
    const b = must(derive({ ...withFacts, decisions: { ...withFacts.decisions } }, AT));
    expect(canonicalJson(a.gap)).toBe(canonicalJson(b.gap));
    // `derive`'s memo is a single-slot "same arguments as last time" cache (Task 1's
    // `memoLast`): it is meant to survive irrelevant field changes across one evolving state,
    // not an unrelated call in between. Re-derive against `withFacts` itself right before the
    // toggle, so the identity check below is against the memo's actual last entry.
    const a2 = must(derive(withFacts, AT));
    const toggled = reduce(withFacts, { type: 'setLanguage', language: 'en', at: AT });
    const c = must(derive(toggled, AT));
    expect(c.draft).toBe(a2.draft);
    expect(c.report).toBe(a2.report);
    expect(c.gap).toBe(a2.gap);
    expect(c.proposals).toBe(a2.proposals);
  });
});
