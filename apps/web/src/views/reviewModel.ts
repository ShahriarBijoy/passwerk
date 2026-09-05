import type { BatteryCategory, MappingProposal } from '@passwerk/core';
import { getAttribute, getAttributesForCategory } from '@passwerk/rules';
import type { LangText, Language } from '../i18n/index.ts';
import { compositeLeafPaths, isArrayComposite } from '../workflow/compositeSchema.ts';
import { type Decision, type DecisionKey, decisionKey, proposalKey } from '../workflow/state.ts';

export interface ReviewGroup {
  key: DecisionKey;
  attributeId: string;
  path?: string;
  name: LangText;
  legalRefs: string[];
  part: number | null;
  proposals: MappingProposal[];
  decision?: Decision;
}

export type ReviewFilter = 'pending' | 'accepted' | 'rejected' | 'all';

export function buildGroups(
  proposals: MappingProposal[],
  decisions: Record<DecisionKey, Decision>,
): ReviewGroup[] {
  const map = new Map<DecisionKey, ReviewGroup>();
  for (const p of proposals) {
    const key = proposalKey(p);
    let g = map.get(key);
    if (!g) {
      const a = getAttribute(p.attributeId);
      g = {
        key,
        attributeId: p.attributeId,
        ...(p.path !== undefined ? { path: p.path } : {}),
        name: a?.name ?? { de: p.attributeId, en: p.attributeId },
        legalRefs: a?.legalRefs ?? [],
        part: a?.part ?? null,
        proposals: [],
        ...(decisions[key] ? { decision: decisions[key] } : {}),
      };
      map.set(key, g);
    }
    g.proposals.push(p);
  }
  return [...map.values()].sort(
    (x, y) =>
      (x.part ?? 99) - (y.part ?? 99) ||
      x.attributeId.localeCompare(y.attributeId) ||
      (x.path ?? '').localeCompare(y.path ?? ''),
  );
}

function stateOf(g: ReviewGroup): Exclude<ReviewFilter, 'all'> {
  if (!g.decision) return 'pending';
  return g.decision.kind === 'reject' ? 'rejected' : 'accepted';
}

export function filterGroups(
  groups: ReviewGroup[],
  filter: ReviewFilter,
  search: string,
  lang: Language,
): ReviewGroup[] {
  const q = search.trim().toLowerCase();
  return groups.filter((g) => {
    if (filter !== 'all' && stateOf(g) !== filter) return false;
    if (!q) return true;
    const hay = [g.attributeId, g.name[lang], ...g.proposals.map((p) => String(p.value))]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function manualEntries(decisions: Record<DecisionKey, Decision>): Decision[] {
  return Object.values(decisions).filter((d) => d.kind === 'manual');
}

/** Dotted paths to the scalar sub-fields a composite can be filled in one at a time. */
export function compositeLeaves(attributeId: string): string[] {
  return compositeLeafPaths(attributeId);
}

/**
 * Attributes a reviewer can type a value for. A composite that is a list of rows is left out:
 * this slice enters composites field by field, and a list has no fields to name.
 */
export function attributeChoices(category: BatteryCategory): { id: string; name: LangText }[] {
  return getAttributesForCategory(category, ['mandatory', 'conditional', 'optional'])
    .filter((a) => !isArrayComposite(a.id))
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((x, y) => x.id.localeCompare(y.id));
}

export function keyOf(d: Decision): DecisionKey {
  return decisionKey(d.attributeId, d.path);
}
