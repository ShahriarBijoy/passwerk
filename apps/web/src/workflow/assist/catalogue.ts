import { byCodePoint } from '@passwerk/core';
import { type BatteryCategory, getAttributesForCategory } from '@passwerk/rules';
import type { CatalogueEntry } from './types.ts';

/**
 * The same statuses `attributeChoices` offers in the acceptance dialog. The model must not be
 * able to name an attribute the reviewer then cannot select, so the two sets are one set.
 */
const OFFERED = ['mandatory', 'conditional', 'optional'] as const;

/** One line of context per attribute. Long enough to disambiguate, short enough for 90 of them. */
export const HINT_MAX = 140;

/** Collapse the knowledge-base explanation to a single bounded line, cutting on a word break. */
function hintOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= HINT_MAX) return flat;
  const cut = flat.slice(0, HINT_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The attribute catalogue the model chooses from: everything the project's category displays,
 * in a stable order. English explanations only — the model is told to answer about ids, and
 * both display names are already there for the semantics.
 */
export function buildCatalogue(category: BatteryCategory): CatalogueEntry[] {
  return getAttributesForCategory(category, OFFERED)
    .map((a) => ({
      id: a.id,
      name: a.name,
      valueKind: a.valueKind,
      unit: a.unit,
      range: a.range,
      group: a.category,
      hint: hintOf(a.explanation.en),
    }))
    .sort((a, b) => byCodePoint(a.id, b.id));
}
