import type {
  BatteryCategory,
  DocumentBundle,
  Fact,
  MappingDecision,
  MappingProposal,
  PassportDraft,
} from '@passwerk/core';
import type { ChoiceResponse, ContentValue, NoulResponse, Question } from '@typesafe-ai/sdk';
import type { ReadingProposal } from '../series/types.js';

/** The mapped model as the automatic chain left it: what the reader reads and judges. */
export interface ReadingInput {
  category: BatteryCategory;
  bundle: DocumentBundle;
  facts: readonly Fact[];
  draft: PassportDraft;
  /** Attributes to fill: open required ones and the template elements they bring in. */
  open: readonly string[];
  /** The rule-based accepts the draft was built from. */
  accepted: readonly MappingProposal[];
}

export interface ReadingResult {
  /** Applied under the reading policy. Every value is copied from a fact or a table cell. */
  decisions: MappingDecision[];
  toConfirm: ReadingProposal[];
  /** The members of `accepted` (by identity) the reader judged not to state their attribute. */
  vetoed: MappingProposal[];
  inputTokens: number;
  requests: number;
}

export interface Reader {
  read(input: ReadingInput): Promise<ReadingResult>;
}

export type Answer = ChoiceResponse | NoulResponse;

export interface JevRequest {
  model: string;
  state: { [key: string]: ContentValue };
  questions: Record<string, Question>;
}

export interface JevResponse {
  model: string;
  answers: Record<string, Answer>;
  inputTokens: number;
}

/** One System One round trip. `stage` names the request in errors and cassettes. */
export type Ask = (stage: string, request: JevRequest) => Promise<JevResponse>;
