import {
  type ApplyResult,
  applyMappings,
  buildReport,
  type FactSet,
  type MappingConflict,
  type MappingDecision,
  type MappingProposal,
  type PassportDraft,
  type ValidationReport,
  validate,
  validateSchema,
} from '@passwerk/core';
import type { LangText } from '../../i18n/index.ts';
import type { Decision, DecisionKey, FactEdit } from '../state.ts';
import { validateValue } from '../validateValue.ts';

/** A decision core refused to apply, kept out of the draft and reported to the reviewer. */
export interface InvalidDecision {
  key: DecisionKey;
  /** Core's exception text (a plain string) for a decision `applyMappings`/`validate` rejected,
   * or this app's own bilingual `validateValue` message for a fact edit an attribute rejects. */
  message: string | LangText;
}

export interface MappingEntry {
  key: DecisionKey;
  mapping: MappingDecision;
}

type ToMappingResult =
  | { kind: 'mapping'; mapping: MappingDecision }
  | { kind: 'invalid'; message: LangText }
  /** Rejected, or waiting for its proposal to come back (a category change, or a fact edit
   * that is still a valid value for its attribute): nothing to apply, nothing to report. */
  | { kind: 'omit' };

function toMapping(
  d: Decision,
  proposals: MappingProposal[],
  facts: FactSet,
  factEdits: Record<string, FactEdit>,
): ToMappingResult {
  const path = d.path !== undefined ? { path: d.path } : {};
  if (d.kind === 'reject') return { kind: 'omit' };
  if (d.kind === 'manual') {
    const fact = d.factId !== undefined ? facts.facts.find((f) => f.id === d.factId) : undefined;
    return {
      kind: 'mapping',
      mapping: {
        attributeId: d.attributeId,
        ...path,
        value: d.value,
        ...(d.unit ? { unit: d.unit } : {}),
        ...(d.recordedAt ? { recordedAt: d.recordedAt } : {}),
        ...(fact ? { source: [fact.source] } : {}),
        override: true,
      },
    };
  }
  const p = proposals.find(
    (x) => x.factId === d.factId && x.attributeId === d.attributeId && x.path === d.path,
  );
  if (!p) {
    // No proposal under the current category: usually the decision merely waits until its
    // proposal is back (a battery-type change strands it, then revives it). But when the
    // decision's fact still exists and carries a reviewer edit, the missing proposal can also
    // mean core's `suggestMappings` dropped the fact because the edited value fails the
    // attribute's own check (PW-L1-VALUE territory) — that must surface, not vanish silently.
    const fact = facts.facts.find((f) => f.id === d.factId);
    const edit = fact ? factEdits[d.factId] : undefined;
    if (fact && edit) {
      const check = validateValue(d.attributeId, d.path, edit.value);
      if (!check.ok) return { kind: 'invalid', message: check.message };
    }
    return { kind: 'omit' };
  }
  const value = d.kind === 'edit' ? d.value : p.value;
  const unit = d.kind === 'edit' ? d.unit : p.unit;
  return {
    kind: 'mapping',
    mapping: {
      attributeId: d.attributeId,
      ...path,
      value,
      ...(unit ? { unit } : {}),
      ...(d.kind === 'edit' && d.recordedAt ? { recordedAt: d.recordedAt } : {}),
      source: p.source,
      confidence: p.confidence,
      override: true,
    },
  };
}

export interface MappingsResult {
  entries: MappingEntry[];
  /** Decisions stranded by a missing proposal whose underlying fact edit the attribute itself
   * rejects: never applied, so never `applyMappings`'s or `validate`'s to blame. */
  invalid: InvalidDecision[];
}

/**
 * Accept, edit and manual decisions as core mapping decisions, in stable key order, plus the
 * ones a fact edit stranded and invalidated. `factEdits` is optional: a caller with no interest
 * in the invalid case (there is no fact edit to check against) can omit it and gets today's
 * silent-wait behaviour for every unmatched decision.
 */
export function mappingEntries(
  decisions: Record<DecisionKey, Decision>,
  proposals: MappingProposal[],
  facts: FactSet,
  factEdits: Record<string, FactEdit> = {},
): MappingsResult {
  const entries: MappingEntry[] = [];
  const invalid: InvalidDecision[] = [];
  for (const key of Object.keys(decisions).sort()) {
    const decision = decisions[key];
    if (!decision) continue;
    const result = toMapping(decision, proposals, facts, factEdits);
    if (result.kind === 'mapping') entries.push({ key, mapping: result.mapping });
    else if (result.kind === 'invalid') invalid.push({ key, message: result.message });
  }
  return { entries, invalid };
}

export interface Applied {
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
export function applyAll(base: PassportDraft, entries: MappingEntry[], asOf: string): Applied {
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
