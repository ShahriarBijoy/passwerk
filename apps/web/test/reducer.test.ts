import { getSample, type PassportDraft } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { defaultProject } from '@/workflow/project.ts';
import { type Action, reduce } from '@/workflow/reducer.ts';
import { initialState, type WorkflowState } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';

const AT = '2026-09-07T12:00:00Z';
const LATER = '2026-09-07T13:00:00Z';
const PROJECT = defaultProject('urn:passwerk:test:1', '');

const facts = (files: string[]) => ({
  facts: files.map((file, i) => ({
    id: `${file}#1:${i}`,
    label: 'l',
    labelKey: 'l',
    raw: 'r',
    value: '1',
    kind: 'text' as const,
    lang: 'de' as const,
    shape: 'kv' as const,
    source: { file, page: 1 },
  })),
  tables: [],
  documents: [],
});
const summary = (name: string, sha256 = 'x') => ({
  name,
  size: 1,
  sha256,
  format: 'pdf',
  pages: 1,
  lang: 'de' as const,
});

function start(): WorkflowState {
  return reduce(initialState, { type: 'setProject', project: PROJECT, at: AT });
}
function withFile(state: WorkflowState, name: string, sha256 = 'x'): WorkflowState {
  return reduce(state, {
    type: 'filesIngested',
    summaries: [summary(name, sha256)],
    facts: facts([name]),
    at: AT,
  });
}

describe('reducer: project', () => {
  it('setProject stamps createdAt once and never changes the step', () => {
    const s = start();
    expect(s.step).toBe('project');
    expect(s.project?.createdAt).toBe(AT);
    const s2 = reduce(s, {
      type: 'setProject',
      project: { ...PROJECT, role: 'importer' },
      at: LATER,
    });
    expect(s2.project?.createdAt).toBe(AT);
    expect(s2.project?.role).toBe('importer');
    expect(s2.updatedAt).toBe(LATER);
    expect(s2.generation).toBe(s.generation);
  });
  it('setProject keeps files, facts and decisions', () => {
    const s = reduce(withFile(start(), 'a.pdf'), {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    });
    const s2 = reduce(s, {
      type: 'setProject',
      project: { ...PROJECT, batteryType: 'LMT' },
      at: LATER,
    });
    expect(s2.files).toHaveLength(1);
    expect(s2.facts?.facts).toHaveLength(1);
    expect(Object.keys(s2.decisions)).toEqual(['ratedCapacity']);
  });
  it('importDraft fills the project from the meta and clears documents and decisions', () => {
    const s0 = withFile(start(), 'a.pdf');
    const draft = getSample('ev-valid') as PassportDraft;
    const s = reduce(s0, { type: 'importDraft', draft, at: AT });
    expect(s.importedDraft).toBe(draft);
    expect(s.project?.manualCategory).toBe('EV');
    expect(s.project?.identifier).toEqual({ mode: 'https', uri: draft.meta.passportId });
    expect(s.project?.createdAt).toBe(draft.meta.createdAt);
    expect(s.files).toEqual([]);
    expect(s.facts).toBeNull();
    expect(s.factEdits).toEqual({});
    expect(s.decisions).toEqual({});
    expect(s.generation).toBe(s0.generation + 1);
    expect(s.step).toBe('review');
  });
});

describe('reducer: facts and edits', () => {
  it('editFact stores an override and clearFactEdit drops it; unknown ids are ignored', () => {
    const s = withFile(start(), 'a.pdf');
    const e = reduce(s, {
      type: 'editFact',
      factId: 'a.pdf#1:0',
      edit: { value: '2', unit: 'kWh' },
      at: AT,
    });
    expect(e.factEdits).toEqual({ 'a.pdf#1:0': { value: '2', unit: 'kWh' } });
    expect(reduce(e, { type: 'clearFactEdit', factId: 'a.pdf#1:0', at: AT }).factEdits).toEqual({});
    expect(reduce(s, { type: 'editFact', factId: 'nope', edit: { value: '2' }, at: AT })).toBe(s);
    expect(reduce(s, { type: 'clearFactEdit', factId: 'nope', at: AT })).toBe(s);
  });
  it('fileRemoved drops the file, its facts, its edits and its non-manual decisions', () => {
    let s = withFile(withFile(start(), 'a.pdf'), 'b.pdf');
    s = reduce(s, { type: 'editFact', factId: 'a.pdf#1:0', edit: { value: '2' }, at: AT });
    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    });
    s = reduce(s, {
      type: 'decide',
      decision: {
        kind: 'manual',
        attributeId: 'nominalVoltage',
        value: '400',
        factId: 'a.pdf#1:0',
      },
      at: AT,
    });
    const r = reduce(s, { type: 'fileRemoved', name: 'a.pdf', at: AT });
    expect(r.files.map((f) => f.name)).toEqual(['b.pdf']);
    expect(r.facts?.facts.map((f) => f.source.file)).toEqual(['b.pdf']);
    expect(r.factEdits).toEqual({});
    expect(Object.keys(r.decisions)).toEqual(['nominalVoltage']);
  });
  it('re-uploading a file with a different hash drops its decisions and edits', () => {
    let s = withFile(start(), 'a.pdf', 'h1');
    s = reduce(s, { type: 'editFact', factId: 'a.pdf#1:0', edit: { value: '2' }, at: AT });
    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    });
    const same = withFile(s, 'a.pdf', 'h1');
    expect(same.decisions).toEqual(s.decisions);
    expect(same.factEdits).toEqual(s.factEdits);
    const changed = withFile(s, 'a.pdf', 'h2');
    expect(changed.decisions).toEqual({});
    expect(changed.factEdits).toEqual({});
    expect(changed.facts?.facts).toHaveLength(1);
  });
  it('decide keeps one decision per key', () => {
    const s = withFile(start(), 'a.pdf');
    const a: Action = {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    };
    const b: Action = {
      type: 'decide',
      decision: { kind: 'reject', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    };
    expect(reduce(reduce(s, a), b).decisions['ratedCapacity']?.kind).toBe('reject');
  });
  it('reset keeps the language and bumps the generation; the store notifies', () => {
    const store = createStore(withFile(start(), 'a.pdf'));
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.dispatch({ type: 'setLanguage', language: 'en', at: AT });
    store.dispatch({ type: 'reset', at: AT });
    // `initialState.generation` is 0; reset bumps the store's own counter instead of resetting
    // it, so the expectation overrides that one field rather than colliding with it.
    expect(store.getState()).toMatchObject({
      ...initialState,
      language: 'en',
      updatedAt: AT,
      generation: 2,
    });
    expect(store.getState().generation).toBe(2);
    expect(notified).toBe(2);
  });
});
