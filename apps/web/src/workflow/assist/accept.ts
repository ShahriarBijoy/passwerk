import type { FactSet } from '@passwerk/core';
import type { AssistSuggestion } from './types.ts';

/**
 * What `AddValueDialog` needs to open on a suggestion. Widened from the facts screen's own
 * prefill by `attributeId` and `path`, so accepting a suggestion is the manual mapping flow
 * that already exists with one more field filled in — same `manual` decision, same provenance,
 * same conflict detection, same validation.
 */
export interface SuggestionPrefill {
  factId: string;
  value: string;
  unit?: string;
  attributeId: string;
  path?: string;
}

/**
 * The value comes from the fact, never from the model. Null when the fact is gone: a re-upload
 * prunes facts and a suggestion can outlive the one it named, and there is nothing honest to
 * put in the dialog then.
 */
export function suggestionPrefill(
  suggestion: AssistSuggestion,
  facts: FactSet,
): SuggestionPrefill | null {
  const fact = facts.facts.find((f) => f.id === suggestion.factId);
  if (!fact) return null;
  return {
    factId: fact.id,
    value: fact.value ?? fact.raw,
    ...(fact.unit === undefined ? {} : { unit: fact.unit }),
    attributeId: suggestion.attributeId,
    ...(suggestion.path === undefined ? {} : { path: suggestion.path }),
  };
}
