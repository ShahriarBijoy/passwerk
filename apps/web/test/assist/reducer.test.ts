import { getSample, newDraft, PassportDraft } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import type { AssistResult, AssistState } from '@/workflow/assist/types.ts';
import { defaultProject } from '@/workflow/project.ts';
import { reduce } from '@/workflow/reducer.ts';
import { initialState, type WorkflowState } from '@/workflow/state.ts';

const AT = '2026-09-08T10:00:00Z';
const PROJECT = defaultProject('urn:passwerk:test:1', '');

const RESULT: AssistResult = {
  suggestions: [
    { factId: 'a.pdf#1:1', attributeId: 'nominalVoltage', reason: 'Nennspannung' },
    { factId: 'a.pdf#1:2', attributeId: 'batteryMass', reason: 'Gewicht' },
  ],
  critiques: [
    { factId: 'a.pdf#1:3', attributeId: 'batteryChemistry', reason: 'eher der Handelsname' },
  ],
  discards: [
    { kind: 'suggestion', reason: 'unknown-attribute', attributeId: 'nope', factId: 'a.pdf#1:4' },
  ],
};

const ran = (state: WorkflowState) =>
  reduce(state, {
    type: 'assistRan',
    result: RESULT,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    at: AT,
  });

const withProject = reduce(initialState, { type: 'setProject', project: PROJECT, at: AT });
const assistOf = (s: WorkflowState): AssistState => {
  if (!s.assist) throw new Error('expected an assist run');
  return s.assist;
};

describe('the assist slice', () => {
  it('starts empty', () => {
    expect(initialState.assist).toBeNull();
  });

  it('records the run with the clock it was given, never a wall clock', () => {
    const a = assistOf(ran(withProject));
    expect(a.runAt).toBe(AT);
    expect(a.provider).toBe('anthropic');
    expect(a.model).toBe('claude-sonnet-5');
    expect(a.suggestions).toHaveLength(2);
    expect(a.critiques).toHaveLength(1);
    expect(a.discards).toHaveLength(1);
  });

  it('replaces the previous run rather than accumulating', () => {
    const twice = reduce(ran(withProject), {
      type: 'assistRan',
      result: { suggestions: [], critiques: [], discards: [] },
      provider: 'openai-compatible',
      model: 'llama3',
      at: AT,
    });
    expect(assistOf(twice).suggestions).toEqual([]);
    expect(assistOf(twice).provider).toBe('openai-compatible');
  });

  it('drops one suggestion the reviewer waves away, keeping the others', () => {
    const after = reduce(ran(withProject), {
      type: 'assistDismissed',
      factId: 'a.pdf#1:1',
      attributeId: 'nominalVoltage',
      at: AT,
    });
    expect(assistOf(after).suggestions.map((s) => s.attributeId)).toEqual(['batteryMass']);
  });

  it('drops a suggestion once its attribute has been decided', () => {
    // The panel must not keep offering a mapping the draft already holds.
    const after = reduce(ran(withProject), {
      type: 'decide',
      decision: {
        kind: 'manual',
        attributeId: 'nominalVoltage',
        factId: 'a.pdf#1:1',
        value: '400',
      },
      at: AT,
    });
    expect(assistOf(after).suggestions.map((s) => s.attributeId)).toEqual(['batteryMass']);
  });

  it('keeps the critiques when a decision is made', () => {
    const after = reduce(ran(withProject), {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'nominalVoltage', factId: 'a.pdf#1:1' },
      at: AT,
    });
    expect(assistOf(after).critiques).toHaveLength(1);
  });

  it('clears on request', () => {
    expect(reduce(ran(withProject), { type: 'assistCleared', at: AT }).assist).toBeNull();
  });

  it('clears when an input that decides the category changes', () => {
    // The catalogue the model chose from was the old category's, so the suggestions no longer
    // mean anything. Battery type, energy and a hand-picked category all move the category.
    const state = ran(withProject);
    for (const project of [
      { ...PROJECT, batteryType: 'LMT' as const },
      { ...PROJECT, energyKwh: '3.5' },
      { ...PROJECT, manualCategory: 'EV' as const },
    ]) {
      expect(reduce(state, { type: 'setProject', project, at: AT }).assist).toBeNull();
    }
  });

  it('survives a project edit that cannot change the category', () => {
    const state = ran(withProject);
    const same = reduce(state, {
      type: 'setProject',
      project: { ...PROJECT, role: 'importer', identifier: { mode: 'draft', urn: 'urn:x:2' } },
      at: AT,
    });
    expect(same.assist).not.toBeNull();
  });

  it('clears on start over', () => {
    expect(reduce(ran(withProject), { type: 'reset', at: AT }).assist).toBeNull();
  });

  it('clears when a draft is imported, since the facts it spoke about are gone', () => {
    const draft = newDraft(PassportDraft.parse(getSample('ev-valid')).meta);
    const imported = reduce(ran(withProject), { type: 'importDraft', draft, at: AT });
    expect(imported.assist).toBeNull();
  });
});
