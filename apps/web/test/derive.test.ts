import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalJson,
  extractFacts,
  type FactSet,
  getSample,
  ingest,
  type MappingProposal,
  type PassportDraft,
  suggestMappings,
} from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { decisionsToMappings, derive } from '@/workflow/derive/index.ts';
import { defaultProject } from '@/workflow/project.ts';
import { reduce } from '@/workflow/reducer.ts';
import {
  type Decision,
  type DecisionKey,
  initialState,
  type WorkflowState,
} from '@/workflow/state.ts';

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
    const evProposals = must(derive(withFacts, AT)).proposals;
    const lmtProposals = suggestMappings(facts, { category: 'LMT' });
    // An EV-only proposal (no equivalent attributeId/factId/path under LMT), so accepting it and
    // then switching to LMT genuinely strands the decision instead of merely re-proposing it.
    const first = evProposals.find(
      (p) =>
        !lmtProposals.some(
          (q) => q.attributeId === p.attributeId && q.factId === p.factId && q.path === p.path,
        ),
    );
    if (!first) throw new Error('expected an EV-only proposal not shared with LMT');
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
    // "Ignored" is pinned, not just "not blamed": under LMT the decision's proposal is gone
    // (`toMapping` drops it silently), so the attribute is not present in the draft either.
    const stranded = dl.draft.attributes[first.attributeId] as { status?: string } | undefined;
    expect(stranded === undefined || stranded.status !== 'present').toBe(true);
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
  it(
    'a fact correction the attribute rejects surfaces as an invalid decision, not a silent ' +
      'drop, and does not clear the accepted count; a category-stranded decision still produces none',
    () => {
      const factId = 'datasheet-en.csv#1:1';
      const accepted = reduce(withFacts, {
        type: 'decide',
        decision: { kind: 'accept', attributeId: 'ratedCapacity', factId },
        at: AT,
      });
      expect(must(derive(accepted, AT)).draft.attributes['ratedCapacity']?.status).toBe('present');
      const edited = reduce(accepted, {
        type: 'editFact',
        factId,
        edit: { value: 'not-a-number' },
        at: AT,
      });
      const d = must(derive(edited, AT));
      expect(d.invalidDecisions).toHaveLength(1);
      expect(d.invalidDecisions[0]?.key).toBe('ratedCapacity');
      expect(d.draft.attributes['ratedCapacity']).toBeUndefined();
      // App.tsx's `accepted` count (Object.values(state.decisions).filter((d) => d.kind !==
      // 'reject').length) is unchanged by this fix: it counts every non-reject decision,
      // invalid or not, and still counts this one after the correction. It is the visible
      // invalid-decision row above that tells the reviewer something needs attention, not a
      // drop in this count.
      expect(Object.values(edited.decisions).filter((x) => x.kind !== 'reject').length).toBe(
        Object.values(accepted.decisions).filter((x) => x.kind !== 'reject').length,
      );

      // The other stranding path (a battery-type change, no fact edit involved) must not be
      // swept into the same "invalid" bucket: it stays the silent-wait, revivable case.
      const evProposals = must(derive(withFacts, AT)).proposals;
      const lmtProposals = suggestMappings(facts, { category: 'LMT' });
      const evOnly = evProposals.find(
        (p) =>
          !lmtProposals.some(
            (q) => q.attributeId === p.attributeId && q.factId === p.factId && q.path === p.path,
          ),
      );
      if (!evOnly) throw new Error('expected an EV-only proposal not shared with LMT');
      const decidedEvOnly = reduce(withFacts, {
        type: 'decide',
        decision: {
          kind: 'accept',
          attributeId: evOnly.attributeId,
          ...(evOnly.path ? { path: evOnly.path } : {}),
          factId: evOnly.factId,
        },
        at: AT,
      });
      const strandedByCategory = reduce(decidedEvOnly, {
        type: 'setProject',
        project: { ...PROJECT, batteryType: 'LMT' },
        at: AT,
      });
      expect(must(derive(strandedByCategory, AT)).invalidDecisions).toEqual([]);
    },
  );
  it(
    'an edit decision overrides value and unit but inherits source and confidence from the ' +
      'proposal; a reviewer-supplied recordedAt reaches the draft and satisfies PW-PLAUS-011',
    () => {
      const p = must(derive(withFacts, AT)).proposals.find(
        (x) => x.confidence >= 0.7 && x.path === undefined,
      );
      if (!p) throw new Error('need a proposal');
      const edited = reduce(withFacts, {
        type: 'decide',
        decision: {
          kind: 'edit',
          attributeId: p.attributeId,
          factId: p.factId,
          value: '1',
          unit: 'kg',
        },
        at: AT,
      });
      const de = must(derive(edited, AT));
      const mapping = decisionsToMappings(edited.decisions, de.proposals, de.facts).find(
        (m) => m.attributeId === p.attributeId,
      );
      expect(mapping).toMatchObject({
        value: '1',
        unit: 'kg',
        source: p.source,
        confidence: p.confidence,
        override: true,
      });

      // A dynamic attribute's plausibility rule (PW-PLAUS-011) needs a reviewer-supplied
      // recordedAt; the app never invents one from the clock.
      const draft = structuredClone(getSample('ev-valid')) as PassportDraft;
      delete (draft.attributes as Record<string, unknown>)['stateOfCharge'];
      const base = reduce(initialState, { type: 'importDraft', draft, at: AT });
      const decision = { kind: 'manual', attributeId: 'stateOfCharge', value: '80' } as const;

      const unstamped = reduce(base, { type: 'decide', decision, at: AT });
      expect(must(derive(unstamped, AT)).report.findings.map((f) => f.ruleId)).toContain(
        'PW-PLAUS-011',
      );

      const stamped = reduce(base, {
        type: 'decide',
        decision: { ...decision, recordedAt: '2026-09-04T10:00:00.000Z' },
        at: AT,
      });
      const sd = must(derive(stamped, AT));
      expect(decisionsToMappings(stamped.decisions, sd.proposals, sd.facts)).toEqual([
        {
          attributeId: 'stateOfCharge',
          value: '80',
          recordedAt: '2026-09-04T10:00:00.000Z',
          override: true,
        },
      ]);
      expect(sd.draft.attributes['stateOfCharge']?.recordedAt).toBe('2026-09-04T10:00:00.000Z');
      expect(sd.report.findings.map((f) => f.ruleId)).not.toContain('PW-PLAUS-011');
    },
  );
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
    const d = must(derive(s, AT));
    expect(d.invalidDecisions.map((x) => x.key)).toEqual(['hazardousSubstances']);
    expect(d.draft.attributes['criticalRawMaterials']?.value).toEqual(repaired);
    // The blamed decision's draft is discarded, not merged behind a stale report.
    expect(d.draft.attributes['hazardousSubstances']?.value).not.toBe('kaputt');
    expect(Array.isArray(d.draft.attributes['hazardousSubstances']?.value)).toBe(true);
    expect(d.report.verdict).toBe('valid');
    expect(d.report.layers.L2.ran).toBe(true);
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

describe('decisionsToMappings', () => {
  it('returns accept/edit/manual mappings in sorted key order, skipping rejects and stranded decisions', () => {
    const proposal = (over: Partial<MappingProposal>): MappingProposal => ({
      attributeId: 'x',
      value: '1',
      factId: 'f1',
      confidence: 0.9,
      source: [{ file: 'a.pdf', page: 1 }],
      why: { de: 'x', en: 'x' },
      checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' },
      ...over,
    });
    const proposals: MappingProposal[] = [
      proposal({ attributeId: 'zAttr', factId: 'f-z' }),
      proposal({ attributeId: 'aAttr', factId: 'f-a' }),
    ];
    const emptyFacts: FactSet = { facts: [], tables: [], documents: [] };
    // Insertion order is deliberately not sorted, to prove `decisionsToMappings` sorts by key.
    const decisions: Record<DecisionKey, Decision> = {
      zAttr: { kind: 'accept', attributeId: 'zAttr', factId: 'f-z' },
      aAttr: { kind: 'edit', attributeId: 'aAttr', factId: 'f-a', value: '2' },
      rejected: { kind: 'reject', attributeId: 'rejected', factId: 'f-r' },
      manualAttr: { kind: 'manual', attributeId: 'manualAttr', value: 'hand-typed' },
      // No proposal matches this factId/attributeId under the current category: stranded.
      stranded: { kind: 'edit', attributeId: 'stranded', factId: 'gone', value: 'x' },
    };
    const mappings = decisionsToMappings(decisions, proposals, emptyFacts);
    expect(mappings.map((m) => m.attributeId)).toEqual(['aAttr', 'manualAttr', 'zAttr']);
    expect(mappings.find((m) => m.attributeId === 'aAttr')).toMatchObject({
      value: '2',
      source: proposals[1]?.source,
      confidence: proposals[1]?.confidence,
      override: true,
    });
    expect(mappings.find((m) => m.attributeId === 'zAttr')).toMatchObject({
      value: '1',
      source: proposals[0]?.source,
      confidence: proposals[0]?.confidence,
      override: true,
    });
    expect(mappings.find((m) => m.attributeId === 'manualAttr')).toEqual({
      attributeId: 'manualAttr',
      value: 'hand-typed',
      override: true,
    });
  });
});
