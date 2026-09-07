import type { FactSet, IngestError, MappingProposal, PassportDraft } from '@passwerk/core';
import type { Language } from '../i18n/index.ts';
import type { Project } from './project.ts';

export const STATE_VERSION = 2 as const;
export type Step = 'project' | 'upload' | 'facts' | 'review' | 'gaps';
export const STEPS: readonly Step[] = ['project', 'upload', 'facts', 'review', 'gaps'];

export interface FileSummary {
  name: string;
  size: number;
  sha256: string;
  format: string;
  pages: number;
  lang: 'de' | 'en';
  error?: IngestError;
}

/** A reviewer's correction of one extracted fact; applied before proposals are derived. */
export interface FactEdit {
  value: string;
  unit?: string;
}

/** `attributeId` alone, or `attributeId#path` for a composite leaf. */
export type DecisionKey = string;

export type Decision =
  | { kind: 'accept'; attributeId: string; path?: string; factId: string }
  | { kind: 'reject'; attributeId: string; path?: string; factId: string }
  | {
      kind: 'edit';
      attributeId: string;
      path?: string;
      factId: string;
      value: string;
      unit?: string;
      /** ISO-8601. The reviewer's LastUpdate for a dynamic value; never synthesised. */
      recordedAt?: string;
    }
  | {
      kind: 'manual';
      attributeId: string;
      path?: string;
      /** Set when the value was mapped from a fact on the facts screen: keeps its provenance. */
      factId?: string;
      /** A string for scalars and composite leaves; an array of rows for an array composite. */
      value: string | unknown[];
      unit?: string;
      /** ISO-8601. The reviewer's LastUpdate for a dynamic value; never synthesised. */
      recordedAt?: string;
    };

export interface WorkflowState {
  version: typeof STATE_VERSION;
  step: Step;
  language: Language;
  project: Project | null;
  /** A draft imported as JSON; its meta is replaced by the project's on derivation. */
  importedDraft: PassportDraft | null;
  files: FileSummary[];
  facts: FactSet | null;
  factEdits: Record<string, FactEdit>;
  decisions: Record<DecisionKey, Decision>;
  /**
   * Bumped when a project is created or replaced (the first `setProject` from `null`,
   * `importDraft`, or `reset`) — not on every edit of an already-active project. An upload
   * started under one generation is discarded when it lands under another, so a slow ingest
   * cannot pour its documents into a project the reviewer has since started over.
   */
  generation: number;
  updatedAt: string;
}

export const initialState: WorkflowState = {
  version: STATE_VERSION,
  step: 'project',
  language: 'de',
  project: null,
  importedDraft: null,
  files: [],
  facts: null,
  factEdits: {},
  decisions: {},
  generation: 0,
  updatedAt: '1970-01-01T00:00:00Z',
};

export function decisionKey(attributeId: string, path?: string): DecisionKey {
  return path === undefined ? attributeId : `${attributeId}#${path}`;
}

export function proposalKey(p: MappingProposal): DecisionKey {
  return decisionKey(p.attributeId, p.path);
}
