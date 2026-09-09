/**
 * The bring-your-own-key mapping assist (ADR D-038).
 *
 * The model answers exactly one question — which knowledge-base attribute a fact belongs to —
 * and gives a second opinion on the deterministic proposals. It never supplies a value: an
 * accepted suggestion takes its value from core's `proposalValue` and its provenance from the
 * fact, so nothing in an emitted passport can originate in the model.
 *
 * Everything in this directory is pure. The transport, the endpoints and the key live in
 * `app/assist/`, behind `Platform.assist`, so a shell that supplies none (the MCP App) cannot
 * reach a network from here.
 */
import type { BatteryCategory, ValueKind } from '@passwerk/rules';
import type { LangText, Language } from '../../i18n/index.ts';

export type AssistProvider = 'anthropic' | 'openai-compatible';

/**
 * What the reviewer typed into the assist panel. Plain data, so `views` can hold it without
 * reaching into `app`; the endpoints it resolves to live in `app/assist/providers.ts`.
 */
export interface AssistConfig {
  provider: AssistProvider;
  model: string;
  apiKey: string;
  /** Required for `openai-compatible`; e.g. `http://localhost:11434/v1` for Ollama. */
  baseUrl?: string;
}

/** One knowledge-base attribute as the model sees it. Public reference data only. */
export interface CatalogueEntry {
  id: string;
  name: LangText;
  valueKind: ValueKind;
  unit: string | null;
  range: { min: number | null; max: number | null } | null;
  /** DIN DKE SPEC 99100 category, so related attributes read as a group. */
  group: string;
  /** The knowledge-base explanation, trimmed to one line. */
  hint: string;
}

/**
 * A fact as the model sees it: label, value, unit, language. Deliberately no file name, page
 * or cell — a file name can carry the supplier's identity and the mapping question does not
 * need it. `request.test.ts` asserts this by searching the serialised request.
 *
 * `id` is a per-run token (`f0`, `f1`, ...), not core's fact id: core's is
 * `${document}#${page}:${ordinal}` and would smuggle the file name out inside the key. The
 * token also gives the response parser an exact-match guard against an invented id.
 */
export interface RequestFact {
  id: string;
  label: string;
  value: string;
  unit?: string;
  lang: Language;
}

/** A deterministic proposal offered up for a second opinion, under its own token (`p0`, ...). */
export interface RequestProposal {
  id: string;
  /** The source fact's label: what the critique is actually about. */
  label: string;
  attributeId: string;
  path?: string;
  value: string;
  unit?: string;
  confidence: number;
}

export interface AssistRequest {
  category: BatteryCategory;
  language: Language;
  catalogue: CatalogueEntry[];
  facts: RequestFact[];
  proposals: RequestProposal[];
}

/** Which real fact and proposal each token in a request stands for. Never serialised. */
export interface AssistRefs {
  facts: Record<string, string>;
  proposals: Record<string, { factId: string; attributeId: string; path?: string }>;
}

/** A request and the local key needed to read its answer. Only `request` leaves the browser. */
export interface BuiltRequest {
  request: AssistRequest;
  refs: AssistRefs;
}

export interface AssistSuggestion {
  factId: string;
  attributeId: string;
  path?: string;
  /** The model's own words, in whatever language it was asked to answer in. */
  reason: string;
}

export interface AssistCritique {
  factId: string;
  attributeId: string;
  path?: string;
  reason: string;
}

export type DiscardReason =
  | 'unknown-attribute'
  | 'not-applicable'
  | 'unknown-fact'
  | 'unknown-path'
  | 'value-refused'
  | 'duplicate'
  | 'already-decided'
  | 'unknown-proposal';

/** Something the model returned that the guards refused. Shown, never silently dropped. */
export interface AssistDiscard {
  kind: 'suggestion' | 'critique';
  reason: DiscardReason;
  attributeId: string;
  factId: string;
}

export interface AssistResult {
  suggestions: AssistSuggestion[];
  critiques: AssistCritique[];
  discards: AssistDiscard[];
}

/** The last run, kept in `WorkflowState` as an input like `factEdits`; `derive` never reads it. */
export interface AssistState extends AssistResult {
  /** From the injected clock, never `Date.now()`. */
  runAt: string;
  provider: AssistProvider;
  model: string;
}

/**
 * Takes the structured request, returns the model's raw text. The one seam between the pure
 * layer and the network: `workflow` knows nothing about endpoints, headers or keys.
 */
export type AssistClient = (request: AssistRequest, signal: AbortSignal) => Promise<string>;
