import type { Attribute, ValueKind } from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import { tokens } from '../extract/normalize.js';
import type { Fact } from '../extract/types.js';
import { isDecimalString } from '../model/values.js';
import type { IndexEntry } from './synonymIndex.js';
import type { MappingChecks } from './types.js';

export function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let common = 0;
  for (const t of sa) if (sb.has(t)) common += 1;
  return (2 * common) / (sa.size + sb.size);
}

/** Spec 6.3: identity 1.0; else Dice; else containment 0.9 x coverage; times the entry weight. */
export function labelScore(labelKey: string, entry: IndexEntry): number {
  if (labelKey === entry.key) return entry.weight;
  const lt = tokens(labelKey);
  const d = dice(lt, entry.tokens);
  const contained = entry.tokens.length > 0 && entry.tokens.every((t) => lt.includes(t));
  const containment = contained ? 0.9 * (entry.tokens.length / lt.length) : 0;
  return Math.max(d, containment) * entry.weight;
}

export function unitFactor(
  attributeUnit: string | null,
  fact: Fact,
): { factor: number; check: MappingChecks['unit'] } {
  if (!attributeUnit && !fact.unit) return { factor: 1, check: 'n/a' };
  if (attributeUnit && !fact.unit) return { factor: 0.85, check: 'missing' };
  if (!attributeUnit && fact.unit) return { factor: 0.6, check: 'mismatch' };
  if (attributeUnit === fact.unit) {
    return fact.rawUnit && fact.rawUnit !== fact.unit
      ? { factor: 1, check: 'converted' }
      : { factor: 1, check: 'match' };
  }
  return { factor: 0.3, check: 'mismatch' };
}

const TEXTUAL: ReadonlySet<ValueKind> = new Set([
  'identifier',
  'text',
  'enum',
  'multilingualText',
  'composite',
]);

type Range = Attribute['range'];

/** The attribute's authored band (ADR D-021); `percentage` without one keeps 0..100. */
function inBand(v: string, valueKind: ValueKind, range: Range): boolean {
  const band = range ?? (valueKind === 'percentage' ? { min: 0, max: 100 } : null);
  if (!band) return true;
  const d = new Decimal(v);
  return (band.min === null || d.gte(band.min)) && (band.max === null || d.lte(band.max));
}

/**
 * Type compatibility of a fact with an attribute's value kind. Numeric kinds also check the
 * knowledge-base `range` (issue #14): the same band `applyMappings` and L1 enforce, so a value
 * the draft would accept is never scored as a type mismatch here.
 */
export function kindFactor(
  valueKind: ValueKind,
  fact: Fact,
  range: Range = null,
): { factor: number; check: MappingChecks['kind'] } {
  if (valueKind === 'document' || valueKind === 'graphic') return { factor: 0, check: 'n/a' };
  if (TEXTUAL.has(valueKind)) return { factor: 1, check: 'n/a' };
  const v = fact.value ?? '';
  let ok = false;
  switch (valueKind) {
    case 'decimal':
      ok =
        (fact.kind === 'decimal' || fact.kind === 'integer') &&
        isDecimalString(v) &&
        inBand(v, valueKind, range);
      break;
    case 'integer':
      ok =
        (fact.kind === 'integer' || (isDecimalString(v) && new Decimal(v).isInteger())) &&
        isDecimalString(v) &&
        inBand(v, valueKind, range);
      break;
    case 'percentage':
      ok =
        (fact.kind === 'decimal' || fact.kind === 'integer') &&
        isDecimalString(v) &&
        inBand(v, valueKind, range);
      break;
    case 'date':
      ok = fact.kind === 'date';
      break;
    case 'dateTime':
      ok = fact.kind === 'date';
      break;
    case 'boolean':
      ok = fact.kind === 'boolean';
      break;
    case 'uri':
      ok = fact.kind === 'uri';
      break;
    // Unreachable: 'document' and 'graphic' return above, the rest are in TEXTUAL. Listed
    // explicitly (rather than falling into `default`) so a new ValueKind fails to compile.
    case 'identifier':
    case 'text':
    case 'enum':
    case 'multilingualText':
    case 'composite':
      ok = false;
      break;
    default: {
      const _exhaustive: never = valueKind;
      throw new Error(`kindFactor: unhandled ValueKind ${String(_exhaustive)}`);
    }
  }
  return ok ? { factor: 1, check: 'ok' } : { factor: 0.4, check: 'mismatch' };
}

const UNIT_TEXT = {
  de: {
    match: 'Einheit passt',
    converted: 'Einheit umgerechnet',
    missing: 'Einheit fehlt im Dokument',
    mismatch: 'Einheit passt nicht',
    'n/a': 'keine Einheit erwartet',
  },
  en: {
    match: 'unit matches',
    converted: 'unit converted',
    missing: 'unit missing in the document',
    mismatch: 'unit does not match',
    'n/a': 'no unit expected',
  },
} as const;
const KIND_TEXT = {
  de: {
    ok: 'Wert hat den erwarteten Typ',
    mismatch: 'Wert hat nicht den erwarteten Typ',
    'n/a': 'Freitext',
  },
  en: {
    ok: 'value has the expected type',
    mismatch: 'value does not have the expected type',
    'n/a': 'free text',
  },
} as const;

export function explainMatch(label: string, checks: MappingChecks, lang: 'de' | 'en'): string {
  const score = checks.label.toFixed(2);
  const head =
    lang === 'de'
      ? `Beschriftung „${label}“ entspricht „${checks.matched}“ (${score})`
      : `Label "${label}" matches "${checks.matched}" (${score})`;
  return `${head}; ${UNIT_TEXT[lang][checks.unit]}; ${KIND_TEXT[lang][checks.kind]}.`;
}
