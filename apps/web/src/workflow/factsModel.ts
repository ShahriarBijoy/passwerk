import type { Fact, MappingProposal } from '@passwerk/core';
import type { Language } from '../i18n/index.ts';
import type { Decision, DecisionKey } from './state.ts';

export type FactStatus =
  | { status: 'mapped'; attributeId: string }
  | { status: 'proposed' }
  | { status: 'unmapped' };

/**
 * mapped: a manual decision with a factId always counts (there is no proposal to corroborate a
 * value the reviewer typed); an accept or edit decision counts only when `proposals` still holds
 * a matching entry (same factId, attributeId and path) — derivation drops the mapping otherwise,
 * and the screen must not claim one the draft does not hold. proposed: a proposal exists; else
 * unmapped.
 */
export function factStatuses(
  facts: Fact[],
  proposals: MappingProposal[],
  decisions: Record<DecisionKey, Decision>,
): Record<string, FactStatus> {
  const corroborated = (d: Decision): boolean =>
    proposals.some(
      (p) => p.factId === d.factId && p.attributeId === d.attributeId && p.path === d.path,
    );
  const mapped = new Map<string, string>();
  for (const d of Object.values(decisions)) {
    if (d.kind === 'reject' || d.factId === undefined) continue;
    if (d.kind !== 'manual' && !corroborated(d)) continue;
    if (!mapped.has(d.factId)) mapped.set(d.factId, d.attributeId);
  }
  const proposed = new Set(proposals.map((p) => p.factId));
  const out: Record<string, FactStatus> = {};
  for (const f of facts) {
    const attributeId = mapped.get(f.id);
    out[f.id] =
      attributeId !== undefined
        ? { status: 'mapped', attributeId }
        : proposed.has(f.id)
          ? { status: 'proposed' }
          : { status: 'unmapped' };
  }
  return out;
}

export interface FactsFilter {
  document: string | 'all';
  status: 'all' | FactStatus['status'];
  search: string;
}

export function filterFacts(
  facts: Fact[],
  statuses: Record<string, FactStatus>,
  filter: FactsFilter,
  _lang: Language,
): Fact[] {
  const q = filter.search.trim().toLowerCase();
  return facts.filter((f) => {
    if (filter.document !== 'all' && f.source.file !== filter.document) return false;
    if (filter.status !== 'all' && statuses[f.id]?.status !== filter.status) return false;
    if (!q) return true;
    const hay = [
      f.label,
      f.raw,
      f.value ?? '',
      f.unit ?? '',
      f.source.file,
      f.source.cell ?? '',
      String(f.source.page ?? ''),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}
