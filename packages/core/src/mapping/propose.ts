import { type Attribute, attributes, type BatteryCategory } from '@passwerk/rules';
import { integral } from '../emit/submodels/shared.js';
import type { Fact, FactSet } from '../extract/types.js';
import { valueSchemaForKind } from '../model/values.js';
import { explain, kindFactor, labelScore, unitFactor } from './scorer.js';
import { type IndexEntry, synonymIndex } from './synonymIndex.js';
import type { MappingChecks, MappingProposal } from './types.js';

export interface SuggestOptions {
  category?: BatteryCategory;
  minConfidence?: number;
}

/** Structural entry points into composite attributes (spec 6.4). Not domain data: which sub-field a plain text lands in. */
export const COMPOSITE_ENTRY: Record<string, (fact: Fact) => { path: string; value: unknown }> = {
  manufacturerInformation: (f) => ({ path: `name.${f.lang}`, value: f.value }),
  batteryChemistry: (f) => ({ path: 'shortName', value: f.value }),
};

/**
 * Shapes a fact's raw text into the value a proposal would carry, or `undefined` when the
 * shaped value fails the attribute's own value schema (`applyMappings` would otherwise throw
 * on acceptance) or, for `boolean`, when the fact was not itself extracted as a boolean.
 * Exported for direct unit testing of value shapes the knowledge base does not yet exercise
 * end to end (no attribute is currently `boolean`).
 */
export function proposalValue(
  attribute: Attribute,
  fact: Fact,
): { value: unknown; path?: string } | undefined {
  const v = fact.value;
  if (v === undefined) return undefined;
  switch (attribute.valueKind) {
    case 'composite': {
      const entry = COMPOSITE_ENTRY[attribute.id];
      return entry ? entry(fact) : undefined;
    }
    case 'document':
    case 'graphic':
      return undefined;
    case 'boolean':
      return fact.kind === 'boolean' ? { value: v === 'true' } : undefined;
    case 'integer': {
      const value = integral(v);
      return valueSchemaForKind('integer').safeParse(value).success ? { value } : undefined;
    }
    case 'multilingualText': {
      const value = { [fact.lang]: v };
      return valueSchemaForKind('multilingualText').safeParse(value).success
        ? { value }
        : undefined;
    }
    default:
      return valueSchemaForKind(attribute.valueKind).safeParse(v).success
        ? { value: v }
        : undefined;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Plain code-point comparison, not `localeCompare`: collation depends on the runtime's Intl
 * data and can differ between Node builds and browsers, which would break the deterministic,
 * byte-identical output this browser-safe package promises (AGENTS.md).
 */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function suggestMappings(facts: FactSet, options: SuggestOptions = {}): MappingProposal[] {
  const min = options.minConfidence ?? 0.3;
  const byId = new Map(attributes.map((a) => [a.id, a]));
  const eligible = new Set(
    attributes
      .filter(
        (a) => !options.category || a.applicability[options.category].status !== 'not_displayed',
      )
      .map((a) => a.id),
  );
  const index = synonymIndex();
  const out: MappingProposal[] = [];
  for (const fact of facts.facts) {
    const best = new Map<string, { score: number; entry: IndexEntry }>();
    for (const e of index) {
      if (!eligible.has(e.attributeId)) continue;
      const s = labelScore(fact.labelKey, e);
      if (s <= 0) continue;
      const prev = best.get(e.attributeId);
      if (!prev || prev.score < s) best.set(e.attributeId, { score: s, entry: e });
    }
    for (const [attributeId, { score, entry }] of best) {
      const attribute = byId.get(attributeId) as Attribute;
      const shaped = proposalValue(attribute, fact);
      if (!shaped) continue;
      const u = unitFactor(attribute.unit, fact);
      const k = kindFactor(attribute.valueKind, fact);
      const confidence = round2(score * u.factor * k.factor);
      if (confidence < min) continue;
      const checks: MappingChecks = {
        label: round2(score),
        matched: entry.text,
        unit: u.check,
        kind: k.check,
      };
      out.push({
        attributeId,
        value: shaped.value,
        ...(shaped.path ? { path: shaped.path } : {}),
        ...(fact.unit ? { unit: fact.unit } : {}),
        source: [fact.source],
        confidence,
        factId: fact.id,
        why: { de: explain(fact.label, checks, 'de'), en: explain(fact.label, checks, 'en') },
        checks,
      });
    }
  }
  return out.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      byCodePoint(a.attributeId, b.attributeId) ||
      byCodePoint(a.factId, b.factId),
  );
}
