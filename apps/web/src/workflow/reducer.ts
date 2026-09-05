import type { FactSet, MappingProposal, PassportDraft, PassportMeta } from '@passwerk/core';
import { newDraft } from '@passwerk/core';
import type { Language } from '../i18n/index.ts';
import {
  type Decision,
  type DecisionKey,
  decisionKey,
  type FileSummary,
  initialState,
  proposalKey,
  type Step,
  type WorkflowState,
} from './state.ts';

interface Stamped {
  at: string;
}

export type Action = Stamped &
  (
    | { type: 'startProject'; meta: PassportMeta }
    | { type: 'importDraft'; draft: PassportDraft }
    | {
        type: 'filesIngested';
        summaries: FileSummary[];
        facts: FactSet;
        proposals: MappingProposal[];
      }
    | { type: 'fileRemoved'; name: string }
    | { type: 'decide'; decision: Decision }
    | { type: 'clearDecision'; key: DecisionKey }
    | { type: 'setLanguage'; language: Language }
    | { type: 'goTo'; step: Step }
    | { type: 'reset' }
  );

const EMPTY_FACTS: FactSet = { facts: [], tables: [], documents: [] };

function mergeFacts(a: FactSet | null, b: FactSet): FactSet {
  const base = a ?? EMPTY_FACTS;
  return {
    facts: [...base.facts, ...b.facts],
    tables: [...base.tables, ...b.tables],
    documents: [...base.documents, ...b.documents],
  };
}

function withoutFile(facts: FactSet | null, name: string): FactSet | null {
  if (!facts) return null;
  return {
    facts: facts.facts.filter((f) => f.source.file !== name),
    tables: facts.tables.filter((t) => t.source.file !== name),
    documents: facts.documents.filter((d) => d.name !== name),
  };
}

/** Drops accept/reject/edit decisions whose proposal no longer exists; manual ones stay. */
function pruneDecisions(
  decisions: Record<DecisionKey, Decision>,
  proposals: MappingProposal[],
): Record<DecisionKey, Decision> {
  const live = new Set(proposals.map((p) => `${proposalKey(p)}|${p.factId}`));
  const out: Record<DecisionKey, Decision> = {};
  for (const [key, d] of Object.entries(decisions)) {
    if (d.kind === 'manual' || live.has(`${key}|${d.factId}`)) out[key] = d;
  }
  return out;
}

/**
 * Fact ids are `${document}#${page}:${ordinal}` with no content hash, so re-uploading a file
 * under the same name regenerates the very ids the reviewer already decided on. `pruneDecisions`
 * therefore keeps a decision that now describes a value nobody looked at. The document hash is
 * the only thing that can tell the two apart: when it changed, every non-manual decision that
 * came from that file goes, matched against the proposals as they were *before* the re-upload.
 */
function withoutChangedFiles(
  decisions: Record<DecisionKey, Decision>,
  previousProposals: MappingProposal[],
  changed: Set<string>,
): Record<DecisionKey, Decision> {
  if (changed.size === 0) return decisions;
  const out: Record<DecisionKey, Decision> = {};
  for (const [key, d] of Object.entries(decisions)) {
    if (d.kind === 'manual') {
      out[key] = d;
      continue;
    }
    const from = previousProposals.find((p) => p.factId === d.factId && proposalKey(p) === key);
    if (from?.source.some((s) => changed.has(s.file))) continue;
    out[key] = d;
  }
  return out;
}

/** Names present before and after the upload whose document hash is not the same one. */
function changedFiles(before: FileSummary[], incoming: FileSummary[]): Set<string> {
  const hashes = new Map(before.map((f) => [f.name, f.sha256]));
  const out = new Set<string>();
  for (const s of incoming) {
    const previous = hashes.get(s.name);
    if (previous !== undefined && previous !== s.sha256) out.add(s.name);
  }
  return out;
}

function decide(state: WorkflowState, decision: Decision): Record<DecisionKey, Decision> {
  const key = decisionKey(decision.attributeId, decision.path);
  const next = { ...state.decisions };
  // One decision per key: the group's other proposals are implicitly rejected by not being chosen.
  next[key] = decision;
  return next;
}

export function reduce(state: WorkflowState, action: Action): WorkflowState {
  const stamp = { updatedAt: action.at };
  switch (action.type) {
    case 'startProject':
      return {
        ...state,
        ...stamp,
        meta: action.meta,
        baseDraft: newDraft(action.meta),
        files: [],
        facts: null,
        proposals: [],
        decisions: {},
        generation: state.generation + 1,
        step: 'upload',
      };
    case 'importDraft':
      return {
        ...state,
        ...stamp,
        meta: action.draft.meta,
        baseDraft: action.draft,
        files: [],
        facts: null,
        proposals: [],
        decisions: {},
        generation: state.generation + 1,
        step: 'review',
      };
    case 'filesIngested': {
      const replaced = new Set(action.summaries.map((s) => s.name));
      let facts = state.facts;
      for (const name of replaced) facts = withoutFile(facts, name);
      const merged = mergeFacts(facts, action.facts);
      const keptProposals = state.proposals.filter(
        (p) => !p.source.some((s) => replaced.has(s.file)),
      );
      const proposals = [...keptProposals, ...action.proposals];
      const kept = withoutChangedFiles(
        state.decisions,
        state.proposals,
        changedFiles(state.files, action.summaries),
      );
      return {
        ...state,
        ...stamp,
        files: [...state.files.filter((f) => !replaced.has(f.name)), ...action.summaries],
        facts: merged,
        proposals,
        decisions: pruneDecisions(kept, proposals),
      };
    }
    case 'fileRemoved': {
      const proposals = state.proposals.filter(
        (p) => !p.source.some((s) => s.file === action.name),
      );
      return {
        ...state,
        ...stamp,
        files: state.files.filter((f) => f.name !== action.name),
        facts: withoutFile(state.facts, action.name),
        proposals,
        decisions: pruneDecisions(state.decisions, proposals),
      };
    }
    case 'decide':
      return { ...state, ...stamp, decisions: decide(state, action.decision) };
    case 'clearDecision': {
      const { [action.key]: _dropped, ...rest } = state.decisions;
      return { ...state, ...stamp, decisions: rest };
    }
    case 'setLanguage':
      return { ...state, ...stamp, language: action.language };
    case 'goTo':
      return { ...state, ...stamp, step: action.step };
    case 'reset':
      return {
        ...initialState,
        ...stamp,
        language: state.language,
        generation: state.generation + 1,
      };
  }
}
