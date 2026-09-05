import {
  getSample,
  type MappingProposal,
  type PassportDraft,
  SCHEMA_VERSION,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { type Action, reduce } from '@/workflow/reducer.ts';
import { initialState, proposalKey, type WorkflowState } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';

const AT = '2026-09-05T12:00:00Z';
const META = {
  schemaVersion: SCHEMA_VERSION,
  category: 'EV' as const,
  createdAt: AT,
  passportId: 'urn:passwerk:test:1',
};

const proposal = (over: Partial<MappingProposal>): MappingProposal => ({
  attributeId: 'ratedCapacity',
  value: '94.5',
  unit: 'Ah',
  factId: 'a.pdf:1',
  confidence: 0.9,
  source: [{ file: 'a.pdf', page: 1 }],
  why: { de: 'x', en: 'x' },
  checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' },
  ...over,
});

const facts = (files: string[]) => ({
  facts: files.map((file, i) => ({
    id: `${file}:${i}`,
    label: 'l',
    labelKey: 'l',
    raw: 'r',
    kind: 'text' as const,
    lang: 'de' as const,
    shape: 'kv' as const,
    source: { file, page: 1 },
  })),
  tables: [],
  documents: [],
});

function start(): WorkflowState {
  return reduce(initialState, { type: 'startProject', meta: META, at: AT });
}

describe('reducer', () => {
  it('startProject creates the base draft and moves to upload', () => {
    const s = start();
    expect(s.step).toBe('upload');
    expect(s.baseDraft?.meta).toEqual(META);
    expect(s.updatedAt).toBe(AT);
  });

  it('importDraft replaces the base and clears documents and decisions', () => {
    const s0 = reduce(start(), {
      type: 'filesIngested',
      summaries: [{ name: 'a.pdf', size: 1, sha256: 'x', format: 'pdf', pages: 1, lang: 'de' }],
      facts: facts(['a.pdf']),
      proposals: [proposal({})],
      at: AT,
    });
    const draft = getSample('ev-valid') as PassportDraft;
    const s = reduce(s0, { type: 'importDraft', draft, at: AT });
    expect(s.baseDraft).toBe(draft);
    expect(s.meta).toEqual(draft.meta);
    expect(s.files).toEqual([]);
    expect(s.proposals).toEqual([]);
    expect(s.decisions).toEqual({});
    expect(s.step).toBe('review');
  });

  it('accepting one proposal rejects its siblings in the same group', () => {
    const a = proposal({ factId: 'a.pdf:1' });
    const b = proposal({ factId: 'b.pdf:1', value: '90', source: [{ file: 'b.pdf', page: 1 }] });
    const s0 = reduce(start(), {
      type: 'filesIngested',
      summaries: [],
      facts: facts(['a.pdf', 'b.pdf']),
      proposals: [a, b],
      at: AT,
    });
    const s = reduce(s0, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf:1' },
      at: AT,
    });
    expect(s.decisions[proposalKey(a)]).toEqual({
      kind: 'accept',
      attributeId: 'ratedCapacity',
      factId: 'a.pdf:1',
    });
    expect(Object.keys(s.decisions)).toEqual(['ratedCapacity']);
  });

  it('fileRemoved drops its summary, facts, proposals and decisions', () => {
    const a = proposal({ factId: 'a.pdf:0' });
    const b = proposal({
      attributeId: 'nominalVoltage',
      factId: 'b.pdf:1',
      source: [{ file: 'b.pdf' }],
    });
    let s = reduce(start(), {
      type: 'filesIngested',
      summaries: [
        { name: 'a.pdf', size: 1, sha256: 'x', format: 'pdf', pages: 1, lang: 'de' },
        { name: 'b.pdf', size: 1, sha256: 'y', format: 'pdf', pages: 1, lang: 'de' },
      ],
      facts: facts(['a.pdf', 'b.pdf']),
      proposals: [a, b],
      at: AT,
    });
    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf:0' },
      at: AT,
    });
    s = reduce(s, { type: 'fileRemoved', name: 'a.pdf', at: AT });
    expect(s.files.map((f) => f.name)).toEqual(['b.pdf']);
    expect(s.facts?.facts.map((f) => f.source.file)).toEqual(['b.pdf']);
    expect(s.proposals.map((p) => p.factId)).toEqual(['b.pdf:1']);
    expect(s.decisions).toEqual({});
  });

  it('re-uploading a same-named file drops its decisions when the bytes changed', () => {
    const p = proposal({ factId: 'a.csv#1:0', source: [{ file: 'a.csv', page: 1 }] });
    const summaries = (sha256: string) => [
      { name: 'a.csv', size: 1, sha256, format: 'csv', pages: 1, lang: 'de' as const },
    ];
    let s = reduce(start(), {
      type: 'filesIngested',
      summaries: summaries('sha-400'),
      facts: facts(['a.csv']),
      proposals: [p],
      at: AT,
    });
    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: p.factId },
      at: AT,
    });
    expect(Object.keys(s.decisions)).toEqual(['ratedCapacity']);

    // Same bytes: the reviewer's decision still describes what the document says.
    const unchanged = reduce(s, {
      type: 'filesIngested',
      summaries: summaries('sha-400'),
      facts: facts(['a.csv']),
      proposals: [p],
      at: AT,
    });
    expect(Object.keys(unchanged.decisions)).toEqual(['ratedCapacity']);

    // Different bytes behind the same name and the same fact id: the decision is stale.
    const changed = reduce(s, {
      type: 'filesIngested',
      summaries: summaries('sha-450'),
      facts: facts(['a.csv']),
      proposals: [{ ...p, value: '90.0' }],
      at: AT,
    });
    expect(changed.decisions).toEqual({});
  });

  it('a changed re-upload keeps decisions sourced from other files, and manual ones', () => {
    const a = proposal({ factId: 'a.csv#1:0', source: [{ file: 'a.csv', page: 1 }] });
    const b = proposal({
      attributeId: 'nominalVoltage',
      factId: 'b.csv#1:0',
      source: [{ file: 'b.csv', page: 1 }],
    });
    const file = (name: string, sha256: string) => ({
      name,
      size: 1,
      sha256,
      format: 'csv',
      pages: 1,
      lang: 'de' as const,
    });
    let s = reduce(start(), {
      type: 'filesIngested',
      summaries: [file('a.csv', 'sha-a'), file('b.csv', 'sha-b')],
      facts: facts(['a.csv', 'b.csv']),
      proposals: [a, b],
      at: AT,
    });
    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'nominalVoltage', factId: b.factId },
      at: AT,
    });
    s = reduce(s, {
      type: 'decide',
      decision: {
        kind: 'manual',
        attributeId: 'batteryChemistry',
        path: 'clearName',
        value: 'NMC',
      },
      at: AT,
    });
    s = reduce(s, {
      type: 'filesIngested',
      summaries: [file('a.csv', 'sha-a2')],
      facts: facts(['a.csv']),
      proposals: [a],
      at: AT,
    });
    expect(Object.keys(s.decisions).sort()).toEqual([
      'batteryChemistry#clearName',
      'nominalVoltage',
    ]);
  });

  it('manual decisions survive file removal and clearDecision removes one key', () => {
    let s = start();
    s = reduce(s, {
      type: 'decide',
      decision: {
        kind: 'manual',
        attributeId: 'batteryChemistry',
        path: 'clearName',
        value: 'NMC',
      },
      at: AT,
    });
    s = reduce(s, { type: 'fileRemoved', name: 'none.pdf', at: AT });
    expect(Object.keys(s.decisions)).toEqual(['batteryChemistry#clearName']);
    s = reduce(s, { type: 'clearDecision', key: 'batteryChemistry#clearName', at: AT });
    expect(s.decisions).toEqual({});
  });

  it('reset returns the initial state but keeps the language', () => {
    let s = reduce(start(), { type: 'setLanguage', language: 'en', at: AT });
    s = reduce(s, { type: 'reset', at: AT });
    expect(s).toEqual({ ...initialState, language: 'en', generation: 2, updatedAt: AT });
  });

  it('the generation counts changes of the active project, and nothing else', () => {
    expect(initialState.generation).toBe(0);
    const started = start();
    expect(started.generation).toBe(1);
    const imported = reduce(started, {
      type: 'importDraft',
      draft: getSample('ev-valid') as PassportDraft,
      at: AT,
    });
    expect(imported.generation).toBe(2);
    expect(reduce(imported, { type: 'reset', at: AT }).generation).toBe(3);

    const others: Action[] = [
      { type: 'goTo', step: 'review', at: AT },
      { type: 'setLanguage', language: 'en', at: AT },
      { type: 'fileRemoved', name: 'a.csv', at: AT },
      { type: 'filesIngested', summaries: [], facts: facts([]), proposals: [], at: AT },
      { type: 'decide', decision: { kind: 'accept', attributeId: 'x', factId: 'y' }, at: AT },
      { type: 'clearDecision', key: 'x', at: AT },
    ];
    expect(others.map((a) => reduce(started, a).generation)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('every action stamps updatedAt from the action, never from the clock', () => {
    const s = reduce(start(), {
      type: 'goTo',
      step: 'start',
      at: '2030-01-01T00:00:00Z',
    } satisfies Action);
    expect(s.updatedAt).toBe('2030-01-01T00:00:00Z');
  });
});

describe('store', () => {
  it('notifies subscribers once per dispatch and unsubscribes', () => {
    const store = createStore(initialState);
    let n = 0;
    const off = store.subscribe(() => n++);
    store.dispatch({ type: 'setLanguage', language: 'en', at: AT });
    expect(n).toBe(1);
    expect(store.getState().language).toBe('en');
    off();
    store.dispatch({ type: 'setLanguage', language: 'de', at: AT });
    expect(n).toBe(1);
  });
});
