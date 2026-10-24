import type {
  BatteryCategory,
  DocumentBundle,
  Fact,
  MappingDecision,
  MappingProposal,
  PassportDraft,
  Provenance,
} from '@passwerk/core';
import type { ChoiceResponse, ContentValue, NoulResponse, Question } from '@typesafe-ai/sdk';

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

/** A value the reader assembled but the policy holds back for a person. */
export interface HeldValue {
  /** Applied as it stands once confirmed; its `source` names the document and location. */
  decision: MappingDecision & { confidence: number; source: Provenance[] };
  /** Document and location, for a person. */
  where: string;
  /** Why the policy held it. */
  reason: string;
}

/**
 * What the reader decided for one model. Plain data, so a recorded result rebuilds the same
 * draft without asking again (`recordedReader`).
 */
export interface ReadingResult {
  /** Applied under the reading policy. Every value is copied from a fact or a table cell. */
  decisions: MappingDecision[];
  /** Held for a person, in attribute and path order. */
  held: HeldValue[];
  /** Held values a person confirmed. A first reading confirms none. */
  confirmed: HeldValue[];
  /** `slotKey`s of the members of `accepted` the reader judged not to state their attribute. */
  vetoed: string[];
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
