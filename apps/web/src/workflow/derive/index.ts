import {
  type FactSet,
  type GapReport,
  gapReport,
  type MappingConflict,
  type MappingDecision,
  type MappingProposal,
  newDraft,
  type PassportDraft,
  type PassportMeta,
  type ValidationReport,
} from '@passwerk/core';
import type { Project } from '../project.ts';
import type { Decision, DecisionKey, FactEdit, WorkflowState } from '../state.ts';
import type { CarrierView } from './carrier.ts';
import { deriveProposals, effectiveFacts } from './facts.ts';
import { applyAll, type InvalidDecision, mappingEntries } from './mappings.ts';
import { memoLast } from './memo.ts';
import { deriveProject } from './project.ts';

export type { CarrierView } from './carrier.ts';
export type { InvalidDecision } from './mappings.ts';
export type { ProjectDerived } from './project.ts';
export { deriveProject } from './project.ts';

export interface Derived {
  meta: PassportMeta;
  /** Effective facts: core's extraction with the reviewer's edits applied. */
  facts: FactSet;
  proposals: MappingProposal[];
  draft: PassportDraft;
  conflicts: MappingConflict[];
  invalidDecisions: InvalidDecision[];
  report: ValidationReport;
  gap: GapReport;
  carrier: CarrierView;
  asOf: string;
}

/** Accept, edit and manual decisions as core mapping decisions, in stable key order. */
export function decisionsToMappings(
  decisions: Record<DecisionKey, Decision>,
  proposals: MappingProposal[],
  facts: FactSet,
): MappingDecision[] {
  return mappingEntries(decisions, proposals, facts).map((e) => e.mapping);
}

const baseOf = memoLast(
  (imported: PassportDraft | null, meta: PassportMeta): PassportDraft =>
    imported ? { ...imported, meta } : newDraft(meta),
);

const deriveInputs = memoLast(
  (
    project: Project,
    importedDraft: PassportDraft | null,
    facts: FactSet | null,
    factEdits: Record<string, FactEdit>,
    decisions: Record<DecisionKey, Decision>,
    asOf: string,
  ): Derived | null => {
    const p = deriveProject(project, asOf);
    if (!p.meta) return null;
    const eff = effectiveFacts(facts, factEdits);
    const proposals = deriveProposals(eff, p.meta.category);
    const base = baseOf(importedDraft, p.meta);
    const { draft, conflicts, invalidDecisions, report } = applyAll(
      base,
      mappingEntries(decisions, proposals, eff),
      asOf,
    );
    const gap = gapReport(draft, { report, asOf });
    return {
      meta: p.meta,
      facts: eff,
      proposals,
      draft,
      conflicts,
      invalidDecisions,
      report,
      gap,
      carrier: p.carrier,
      asOf,
    };
  },
);

/** Everything the screens show, from inputs alone. Null until the project yields a meta. */
export function derive(state: WorkflowState, asOf: string): Derived | null {
  if (!state.project) return null;
  return deriveInputs(
    state.project,
    state.importedDraft,
    state.facts,
    state.factEdits,
    state.decisions,
    asOf,
  );
}
