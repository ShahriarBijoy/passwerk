import { type BatteryCategory, type FactSet, suggestMappings } from '@passwerk/core';
import type { FactEdit } from '../state.ts';
import { memoLast } from './memo.ts';

const EMPTY: FactSet = { facts: [], tables: [], documents: [] };

/** The facts as core extracted them with the reviewer's edits applied; a plain `FactSet`. */
export const effectiveFacts = memoLast(
  (facts: FactSet | null, edits: Record<string, FactEdit>): FactSet => {
    if (!facts) return EMPTY;
    if (Object.keys(edits).length === 0) return facts;
    return {
      ...facts,
      facts: facts.facts.map((f) => {
        const e = edits[f.id];
        if (!e) return f;
        const { unit: _dropped, ...rest } = f;
        return { ...rest, raw: e.value, value: e.value, ...(e.unit ? { unit: e.unit } : {}) };
      }),
    };
  },
);

export const deriveProposals = memoLast((facts: FactSet, category: BatteryCategory) =>
  facts.facts.length === 0 ? [] : suggestMappings(facts, { category }),
);
