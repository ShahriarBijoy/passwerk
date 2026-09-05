import {
  type ApplyResult,
  applyMappings,
  buildReport,
  type GapReport,
  gapReport,
  type MappingConflict,
  type MappingDecision,
  type PassportDraft,
  type ValidationReport,
  validate,
  validateSchema,
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
      ...(d.recordedAt ? { recordedAt: d.recordedAt } : {}),
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
    ...(d.kind === 'edit' && d.recordedAt ? { recordedAt: d.recordedAt } : {}),
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
  report: ValidationReport;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type Attempt<T> = { ok: true; value: T } | { ok: false; message: string };

function tryApply(draft: PassportDraft, mapping: MappingDecision): Attempt<ApplyResult> {
  try {
    return { ok: true, value: applyMappings(draft, [mapping]) };
  } catch (e) {
    return { ok: false, message: messageOf(e) };
  }
}

function tryValidate(draft: PassportDraft, asOf: string): Attempt<ValidationReport> {
  try {
    return { ok: true, value: validate(draft, { asOf }) };
  } catch (e) {
    return { ok: false, message: messageOf(e) };
  }
}

/**
 * What core's L1 alone can say about a draft the full validator cannot walk. L1 is a plain
 * schema pass and still returns its findings for such a draft (that is how one gets imported
 * in the first place: `validateSchema` reports a PW-L1-VALUE error and hands the draft back).
 * Nothing is invented and no layer is claimed to have run that did not, so the verdict is
 * whatever L1's own findings make it: `invalid`, because a value-level error is an error.
 */
function l1Only(draft: PassportDraft): ValidationReport {
  return buildReport(validateSchema(draft).findings, {
    L1: true,
    L2: false,
    L3: false,
    L4: false,
  });
}

/**
 * Fold the decisions one at a time, validating after each, and set aside the ones that fail.
 *
 * `report` is the invariant: it holds the validation of exactly the draft in hand, or `null`
 * when that draft is one core cannot walk. A decision is blamed only when the state *directly
 * before it* validated, because only then is the decision what broke it: an imported draft can
 * arrive broken with its decisions already cleared, and a decision that repairs such a base
 * makes the ones after it blameable again. When the prior state did not validate either, the
 * decision is merged unblamed and `report` stays `null`, so the fallback below reports L1 alone
 * rather than carrying a stale verdict over a draft no validator has walked.
 */
function foldOneByOne(base: PassportDraft, entries: MappingEntry[], asOf: string): Applied {
  let draft = base;
  const seed = tryValidate(base, asOf);
  let report: ValidationReport | null = seed.ok ? seed.value : null;
  const conflicts: MappingConflict[] = [];
  const invalidDecisions: InvalidDecision[] = [];
  for (const entry of entries) {
    const applied = tryApply(draft, entry.mapping);
    if (!applied.ok) {
      invalidDecisions.push({ key: entry.key, message: applied.message });
      continue;
    }
    // Validate before keeping the draft: a whole-composite value passes `applyMappings`
    // (its shape is L1's business) and only throws once a validator walks it.
    const next = tryValidate(applied.value.draft, asOf);
    if (!next.ok && report !== null) {
      invalidDecisions.push({ key: entry.key, message: next.message });
      continue;
    }
    draft = applied.value.draft;
    report = next.ok ? next.value : null;
    conflicts.push(...applied.value.conflicts);
  }
  return { draft, conflicts, invalidDecisions, report: report ?? l1Only(draft) };
}

/**
 * `applyMappings` throws on a value its attribute's schema rejects and `validate` throws on a
 * composite whose shape is wrong, and `derive` runs during render, so neither an unchecked
 * decision nor an imported draft would take the whole page down (and both are autosaved). The
 * happy path is one batch apply and one validate; only when that pair throws does the fold
 * above isolate the offending decisions and keep the rest.
 */
function applyAll(base: PassportDraft, entries: MappingEntry[], asOf: string): Applied {
  try {
    const r = applyMappings(
      base,
      entries.map((e) => e.mapping),
    );
    const report = validate(r.draft, { asOf });
    return { draft: r.draft, conflicts: r.conflicts, invalidDecisions: [], report };
  } catch {
    return foldOneByOne(base, entries, asOf);
  }
}

const cache = new WeakMap<WorkflowState, { asOf: string; derived: Derived | null }>();

export function derive(state: WorkflowState, asOf: string): Derived | null {
  const hit = cache.get(state);
  if (hit && hit.asOf === asOf) return hit.derived;
  let derived: Derived | null = null;
  if (state.baseDraft) {
    const { draft, conflicts, invalidDecisions, report } = applyAll(
      state.baseDraft,
      mappingEntries(state),
      asOf,
    );
    const gap = gapReport(draft, { report, asOf });
    derived = { draft, conflicts, invalidDecisions, report, gap, asOf };
  }
  cache.set(state, { asOf, derived });
  return derived;
}
