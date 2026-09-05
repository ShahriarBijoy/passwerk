import {
  applyMappings,
  type GapReport,
  gapReport,
  type MappingConflict,
  type MappingDecision,
  type PassportDraft,
  type ValidationReport,
  validate,
} from '@passwerk/core';
import type { Decision, DecisionKey, WorkflowState } from './state.ts';

/** A decision core refused to apply, kept out of the draft and reported to the reviewer. */
export interface InvalidDecision {
  key: DecisionKey;
  message: string;
}

export interface Derived {
  draft: PassportDraft;
  conflicts: MappingConflict[];
  invalidDecisions: InvalidDecision[];
  report: ValidationReport;
  gap: GapReport;
  asOf: string;
}

function toMapping(state: WorkflowState, d: Decision): MappingDecision | null {
  const path = d.path !== undefined ? { path: d.path } : {};
  if (d.kind === 'reject') return null;
  if (d.kind === 'manual') {
    return {
      attributeId: d.attributeId,
      ...path,
      value: d.value,
      ...(d.unit ? { unit: d.unit } : {}),
      override: true,
    };
  }
  const p = state.proposals.find(
    (x) => x.factId === d.factId && x.attributeId === d.attributeId && x.path === d.path,
  );
  if (!p) return null;
  const value = d.kind === 'edit' ? d.value : p.value;
  const unit = d.kind === 'edit' ? d.unit : p.unit;
  return {
    attributeId: d.attributeId,
    ...path,
    value,
    ...(unit ? { unit } : {}),
    source: p.source,
    confidence: p.confidence,
    override: true,
  };
}

interface MappingEntry {
  key: DecisionKey;
  mapping: MappingDecision;
}

/** Accept, edit and manual decisions as core mapping decisions, in stable key order. */
function mappingEntries(state: WorkflowState): MappingEntry[] {
  return Object.keys(state.decisions)
    .sort()
    .map((key) => ({ key, decision: state.decisions[key] }))
    .filter((e): e is { key: DecisionKey; decision: Decision } => e.decision !== undefined)
    .map((e) => ({ key: e.key, mapping: toMapping(state, e.decision) }))
    .filter((e): e is MappingEntry => e.mapping !== null);
}

/** Accept, edit and manual decisions as core mapping decisions, in stable key order. */
export function decisionsToMappings(state: WorkflowState): MappingDecision[] {
  return mappingEntries(state).map((e) => e.mapping);
}

interface Applied {
  draft: PassportDraft;
  conflicts: MappingConflict[];
  invalidDecisions: InvalidDecision[];
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * `applyMappings` throws on a value its attribute's schema rejects, and `derive` runs during
 * render, so an unchecked decision would take the whole page down (and it is already autosaved).
 * The happy path is the single batch call; only when that throws does the fold below isolate
 * the offending decisions and keep the rest.
 */
function applyAll(base: PassportDraft, entries: MappingEntry[]): Applied {
  try {
    const r = applyMappings(
      base,
      entries.map((e) => e.mapping),
    );
    return { draft: r.draft, conflicts: r.conflicts, invalidDecisions: [] };
  } catch {
    let draft = base;
    const conflicts: MappingConflict[] = [];
    const invalidDecisions: InvalidDecision[] = [];
    for (const entry of entries) {
      try {
        const r = applyMappings(draft, [entry.mapping]);
        draft = r.draft;
        conflicts.push(...r.conflicts);
      } catch (e) {
        invalidDecisions.push({ key: entry.key, message: messageOf(e) });
      }
    }
    return { draft, conflicts, invalidDecisions };
  }
}

const cache = new WeakMap<WorkflowState, { asOf: string; derived: Derived | null }>();

export function derive(state: WorkflowState, asOf: string): Derived | null {
  const hit = cache.get(state);
  if (hit && hit.asOf === asOf) return hit.derived;
  let derived: Derived | null = null;
  if (state.baseDraft) {
    const { draft, conflicts, invalidDecisions } = applyAll(state.baseDraft, mappingEntries(state));
    const report = validate(draft, { asOf });
    const gap = gapReport(draft, { report, asOf });
    derived = { draft, conflicts, invalidDecisions, report, gap, asOf };
  }
  cache.set(state, { asOf, derived });
  return derived;
}
