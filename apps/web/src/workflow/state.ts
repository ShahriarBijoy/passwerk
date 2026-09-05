import type {
  BatteryCategory,
  FactSet,
  IngestError,
  MappingProposal,
  PassportDraft,
  PassportMeta,
} from '@passwerk/core';
import type { Language } from '../i18n/index.ts';

export const STATE_VERSION = 1 as const;
export type Step = 'start' | 'upload' | 'review' | 'gaps';
export const STEPS: readonly Step[] = ['start', 'upload', 'review', 'gaps'];

export interface FileSummary {
  name: string;
  size: number;
  sha256: string;
  format: string;
  pages: number;
  lang: 'de' | 'en';
  error?: IngestError;
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
      value: string;
      unit?: string;
      /** ISO-8601. The reviewer's LastUpdate for a dynamic value; never synthesised. */
      recordedAt?: string;
    };

export interface WorkflowState {
  version: typeof STATE_VERSION;
  step: Step;
  language: Language;
  meta: PassportMeta | null;
  baseDraft: PassportDraft | null;
  files: FileSummary[];
  facts: FactSet | null;
  proposals: MappingProposal[];
  decisions: Record<DecisionKey, Decision>;
  /**
   * Bumped whenever the active project is replaced. An upload started under one generation is
   * discarded when it lands under another, so a slow ingest cannot pour its documents into a
   * project the reviewer has since started over.
   */
  generation: number;
  updatedAt: string;
}

export const initialState: WorkflowState = {
  version: STATE_VERSION,
  step: 'start',
  language: 'de',
  meta: null,
  baseDraft: null,
  files: [],
  facts: null,
  proposals: [],
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

export function categoryOf(state: WorkflowState): BatteryCategory | undefined {
  return state.meta?.category;
}
