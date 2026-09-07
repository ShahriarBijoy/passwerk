import type { Fact, FactSet, PassportDraft } from '@passwerk/core';
import type { Language } from '../i18n/index.ts';
import { type Project, projectFromMeta } from './project.ts';
import {
  type Decision,
  type DecisionKey,
  decisionKey,
  type FactEdit,
  type FileSummary,
  initialState,
  type Step,
  type WorkflowState,
} from './state.ts';

interface Stamped {
  at: string;
}

export type Action = Stamped &
  (
    | { type: 'setProject'; project: Project }
    | { type: 'importDraft'; draft: PassportDraft }
    | { type: 'filesIngested'; summaries: FileSummary[]; facts: FactSet }
    | { type: 'fileRemoved'; name: string }
    | { type: 'editFact'; factId: string; edit: FactEdit }
    | { type: 'clearFactEdit'; factId: string }
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

function withoutFiles(facts: FactSet | null, names: Set<string>): FactSet | null {
  if (!facts) return null;
  return {
    facts: facts.facts.filter((f) => !names.has(f.source.file)),
    tables: facts.tables.filter((t) => !names.has(t.source.file)),
    documents: facts.documents.filter((d) => !names.has(d.name)),
  };
}

const factIds = (facts: FactSet | null): Set<string> =>
  new Set((facts ?? EMPTY_FACTS).facts.map((f) => f.id));

/**
 * Drops accept/reject/edit decisions whose fact no longer exists; manual ones stay (a value the
 * reviewer typed does not vanish with a document; its provenance is simply gone).
 */
function pruneDecisions(
  decisions: Record<DecisionKey, Decision>,
  facts: FactSet | null,
): Record<DecisionKey, Decision> {
  const live = factIds(facts);
  const out: Record<DecisionKey, Decision> = {};
  for (const [key, d] of Object.entries(decisions)) {
    if (d.kind === 'manual' || live.has(d.factId)) out[key] = d;
  }
  return out;
}

function pruneEdits(
  edits: Record<string, FactEdit>,
  facts: FactSet | null,
): Record<string, FactEdit> {
  const live = factIds(facts);
  return Object.fromEntries(Object.entries(edits).filter(([id]) => live.has(id)));
}

/**
 * Fact ids are `${document}#${page}:${ordinal}` with no content hash, so re-uploading a file
 * under the same name regenerates the very ids the reviewer already decided on. The document
 * hash is the only thing that can tell the two apart: when it changed, every non-manual decision
 * and every edit that came from that file goes, matched against the facts as they were *before*
 * the re-upload.
 */
function fileOfFact(facts: FactSet | null, factId: string): string | undefined {
  return (facts ?? EMPTY_FACTS).facts.find((f: Fact) => f.id === factId)?.source.file;
}

function withoutChangedFiles(
  state: WorkflowState,
  changed: Set<string>,
): { decisions: Record<DecisionKey, Decision>; factEdits: Record<string, FactEdit> } {
  if (changed.size === 0) return { decisions: state.decisions, factEdits: state.factEdits };
  const decisions: Record<DecisionKey, Decision> = {};
  for (const [key, d] of Object.entries(state.decisions)) {
    if (d.kind === 'manual') {
      decisions[key] = d;
      continue;
    }
    const file = fileOfFact(state.facts, d.factId);
    if (file !== undefined && changed.has(file)) continue;
    decisions[key] = d;
  }
  const factEdits = Object.fromEntries(
    Object.entries(state.factEdits).filter(([id]) => {
      const file = fileOfFact(state.facts, id);
      return file === undefined || !changed.has(file);
    }),
  );
  return { decisions, factEdits };
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
  // One decision per key: the group's other proposals are implicitly rejected by not being chosen.
  return { ...state.decisions, [key]: decision };
}

export function reduce(state: WorkflowState, action: Action): WorkflowState {
  const stamp = { updatedAt: action.at };
  switch (action.type) {
    case 'setProject':
      return {
        ...state,
        ...stamp,
        project: { ...action.project, createdAt: state.project?.createdAt ?? action.at },
        generation: state.project === null ? state.generation + 1 : state.generation,
      };
    case 'importDraft':
      return {
        ...state,
        ...stamp,
        project: projectFromMeta(action.draft.meta),
        importedDraft: action.draft,
        files: [],
        facts: null,
        factEdits: {},
        decisions: {},
        generation: state.generation + 1,
        step: 'review',
      };
    case 'filesIngested': {
      const replaced = new Set(action.summaries.map((s) => s.name));
      const merged = mergeFacts(withoutFiles(state.facts, replaced), action.facts);
      const kept = withoutChangedFiles(state, changedFiles(state.files, action.summaries));
      return {
        ...state,
        ...stamp,
        files: [...state.files.filter((f) => !replaced.has(f.name)), ...action.summaries],
        facts: merged,
        factEdits: pruneEdits(kept.factEdits, merged),
        decisions: pruneDecisions(kept.decisions, merged),
      };
    }
    case 'fileRemoved': {
      const facts = withoutFiles(state.facts, new Set([action.name]));
      return {
        ...state,
        ...stamp,
        files: state.files.filter((f) => f.name !== action.name),
        facts,
        factEdits: pruneEdits(state.factEdits, facts),
        decisions: pruneDecisions(state.decisions, facts),
      };
    }
    case 'editFact': {
      if (!factIds(state.facts).has(action.factId)) return state;
      return {
        ...state,
        ...stamp,
        factEdits: { ...state.factEdits, [action.factId]: action.edit },
      };
    }
    case 'clearFactEdit': {
      const { [action.factId]: _dropped, ...rest } = state.factEdits;
      return { ...state, ...stamp, factEdits: rest };
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
