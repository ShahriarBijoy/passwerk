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
import type { Decision, WorkflowState } from './state.ts';

export interface Derived {
  draft: PassportDraft;
  conflicts: MappingConflict[];
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

/** Accept, edit and manual decisions as core mapping decisions, in stable key order. */
export function decisionsToMappings(state: WorkflowState): MappingDecision[] {
  return Object.keys(state.decisions)
    .sort()
    .map((key) => state.decisions[key])
    .filter((d): d is Decision => d !== undefined)
    .map((d) => toMapping(state, d))
    .filter((m): m is MappingDecision => m !== null);
}

const cache = new WeakMap<WorkflowState, { asOf: string; derived: Derived | null }>();

export function derive(state: WorkflowState, asOf: string): Derived | null {
  const hit = cache.get(state);
  if (hit && hit.asOf === asOf) return hit.derived;
  let derived: Derived | null = null;
  if (state.baseDraft) {
    const { draft, conflicts } = applyMappings(state.baseDraft, decisionsToMappings(state));
    const report = validate(draft, { asOf });
    const gap = gapReport(draft, { report, asOf });
    derived = { draft, conflicts, report, gap, asOf };
  }
  cache.set(state, { asOf, derived });
  return derived;
}
