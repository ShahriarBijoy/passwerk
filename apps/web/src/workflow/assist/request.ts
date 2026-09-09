import { byCodePoint, type FactSet, type MappingProposal } from '@passwerk/core';
import type { BatteryCategory } from '@passwerk/rules';
import type { Language } from '../../i18n/index.ts';
import type { Decision, DecisionKey } from '../state.ts';
import { buildCatalogue } from './catalogue.ts';
import type { AssistRefs, BuiltRequest, RequestFact, RequestProposal } from './types.ts';

/**
 * The review screen's own bar for a proposal worth trusting, and the bar `docs/EVALUATION.md`
 * measures at. A fact with a proposal at or above it is not a mapping the deterministic path
 * missed, so it is offered for critique rather than for suggestion.
 */
export const ASSIST_THRESHOLD = 0.7;

export interface BuildRequestInput {
  category: BatteryCategory;
  language: Language;
  facts: FactSet;
  proposals: MappingProposal[];
  decisions: Record<DecisionKey, Decision>;
}

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

/**
 * What the model is asked about: the facts the synonym index could not place, plus the
 * proposals it did place, for a second opinion.
 *
 * Only label, value, unit and language leave the browser for a fact, under a per-run token.
 * Provenance stays here — including core's fact id, which embeds the file name. The returned
 * `refs` is the local key from token back to fact; `request.test.ts` asserts that no file
 * name, page or cell survives serialisation.
 */
export function buildRequest(input: BuildRequestInput): BuiltRequest {
  const { category, language, facts, proposals, decisions } = input;
  const refs: AssistRefs = { facts: {}, proposals: {} };

  const labelOf = new Map(facts.facts.map((f) => [f.id, f.label]));
  const confident = new Set<string>();
  const critiqued: RequestProposal[] = [];
  const ordered = [...proposals]
    .filter((p) => p.confidence >= ASSIST_THRESHOLD)
    .sort(
      (a, b) =>
        byCodePoint(a.factId, b.factId) ||
        byCodePoint(a.attributeId, b.attributeId) ||
        byCodePoint(a.path ?? '', b.path ?? ''),
    );
  for (const [i, p] of ordered.entries()) {
    const id = `p${i}`;
    confident.add(p.factId);
    refs.proposals[id] = {
      factId: p.factId,
      attributeId: p.attributeId,
      ...(p.path === undefined ? {} : { path: p.path }),
    };
    critiqued.push({
      id,
      // The label is the whole question. Without it "Ladespannung -> nominalVoltage" and a
      // correct nominal-voltage mapping are the same row, and the critique pass is guesswork.
      label: labelOf.get(p.factId) ?? '',
      attributeId: p.attributeId,
      ...(p.path === undefined ? {} : { path: p.path }),
      value: asString(p.value),
      ...(p.unit === undefined ? {} : { unit: p.unit }),
      confidence: p.confidence,
    });
  }

  // Only a decision that put a value in the draft settles a fact. A rejection leaves it
  // unmapped, which makes it the fact most in need of a suggestion, not the least; the
  // rejected attribute itself stays blocked by the response guard on the decision key.
  const decided = new Set(
    Object.values(decisions)
      .filter((d) => d.kind !== 'reject')
      .map((d) => d.factId)
      .filter((id): id is string => id !== undefined),
  );
  const open = facts.facts
    .filter((f) => !confident.has(f.id) && !decided.has(f.id))
    .filter((f) => (f.value ?? f.raw).trim() !== '')
    .sort((a, b) => byCodePoint(a.id, b.id));
  const asked: RequestFact[] = open.map((f, i) => {
    const id = `f${i}`;
    refs.facts[id] = f.id;
    return {
      id,
      label: f.label,
      value: f.value ?? f.raw,
      ...(f.unit === undefined ? {} : { unit: f.unit }),
      lang: f.lang,
    };
  });

  return {
    request: {
      category,
      language,
      catalogue: buildCatalogue(category),
      facts: asked,
      proposals: critiqued,
    },
    refs,
  };
}
