import { attributes, getTemplateElement } from '@passwerk/rules';
import { normalizeLabel, tokens } from '../extract/normalize.js';

export interface IndexEntry {
  attributeId: string;
  key: string;
  tokens: string[];
  weight: number;
  origin: 'name' | 'synonym' | 'concept' | 'id';
  text: string;
}

const WEIGHT: Record<IndexEntry['origin'], number> = {
  name: 1,
  synonym: 0.95,
  concept: 0.8,
  id: 0.7,
};

function entry(
  attributeId: string,
  text: string,
  origin: IndexEntry['origin'],
): IndexEntry | undefined {
  const key = normalizeLabel(text);
  return key.length === 0
    ? undefined
    : { attributeId, key, tokens: tokens(key), weight: WEIGHT[origin], origin, text };
}

let cache: IndexEntry[] | undefined;
let byAttribute: Map<string, IndexEntry[]> | undefined;

/** Synonym index over the knowledge base (spec 6.1). Built once per process, deterministic order. */
export function synonymIndex(): IndexEntry[] {
  if (cache) return cache;
  const out: IndexEntry[] = [];
  for (const a of attributes) {
    const push = (text: string, origin: IndexEntry['origin']) => {
      const e = entry(a.id, text, origin);
      if (e) out.push(e);
    };
    push(a.name.de, 'name');
    push(a.name.en, 'name');
    for (const s of a.synonyms.de) push(s, 'synonym');
    for (const s of a.synonyms.en) push(s, 'synonym');
    for (const path of a.templatePaths) {
      const concept = getTemplateElement(path)?.concept;
      if (!concept) continue;
      for (const lang of ['de', 'en']) {
        const preferred = concept.preferredName[lang];
        const short = concept.shortName[lang];
        if (preferred) push(preferred, 'concept');
        if (short) push(short, 'concept');
      }
    }
    push(
      a.id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'),
      'id',
    );
  }
  // Deduplicate identical (attributeId, key): keep the highest weight.
  const best = new Map<string, IndexEntry>();
  for (const e of out) {
    const k = `${e.attributeId}|${e.key}`;
    const prev = best.get(k);
    if (!prev || prev.weight < e.weight) best.set(k, e);
  }
  cache = [...best.values()];
  byAttribute = new Map();
  for (const e of cache)
    byAttribute.set(e.attributeId, [...(byAttribute.get(e.attributeId) ?? []), e]);
  return cache;
}

export function entriesFor(attributeId: string): IndexEntry[] {
  synonymIndex();
  return byAttribute?.get(attributeId) ?? [];
}
