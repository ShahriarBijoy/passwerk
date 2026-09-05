import { Decimal } from 'decimal.js';

interface UnitRule {
  match: RegExp;
  unit: string;
  factor?: string;
}

/**
 * Written forms -> KB unit vocabulary. All patterns are anchored (`^...$`); order matters
 * only among overlapping alternatives, where the more specific pattern must come first
 * (`%/month` before the bare `%`, `mAh`/`mV`/`mOhm` before `Ah`/`V`/`Ohm`).
 */
const RULES: UnitRule[] = [
  { match: /^kg\s*CO2(e|-?[aä]q\.?)\s*\/\s*kWh$/i, unit: 'kgCO2e/kWh' },
  { match: /^t\s*CO2(e|-?[aä]q\.?)$/i, unit: 'tCO2e' },
  { match: /^%\s*\/\s*(monat|month)$/i, unit: '%/month' },
  { match: /^W\s*\/\s*Wh$/, unit: 'W/Wh' },
  { match: /^(°C|℃|degC|Grad Celsius)$/i, unit: 'degC' },
  { match: /^mAh$/, unit: 'Ah', factor: '0.001' },
  { match: /^Ah$/, unit: 'Ah' },
  { match: /^MWh$/, unit: 'kWh', factor: '1000' },
  { match: /^kWh$/, unit: 'kWh' },
  { match: /^Wh$/, unit: 'kWh', factor: '0.001' },
  { match: /^kW$/, unit: 'W', factor: '1000' },
  { match: /^W$/, unit: 'W' },
  { match: /^mV$/, unit: 'V', factor: '0.001' },
  { match: /^V$/, unit: 'V' },
  { match: /^kg$/, unit: 'kg' },
  { match: /^g$/, unit: 'kg', factor: '0.001' },
  { match: /^t$/, unit: 'kg', factor: '1000' },
  { match: /^(mΩ|mOhm)$/, unit: 'Ohm', factor: '0.001' },
  { match: /^(Ω|Ohm)$/, unit: 'Ohm' },
  { match: /^%$/, unit: '%' },
  { match: /^(Zyklen|cycles|Zyklus|cycle)$/i, unit: 'cycles' },
  { match: /^(Monate|Monat|months|month)$/i, unit: 'months' },
  { match: /^(Jahre|Jahr|years|year)$/i, unit: 'years' },
  // Bare lower-case 'a' is the SI year abbreviation; upper-case 'A' is ampere and must not match.
  { match: /^a$/, unit: 'years' },
  { match: /^(h|Std\.?|Stunden|hours)$/i, unit: 'min', factor: '60' },
  { match: /^(min|Minuten|minutes)$/i, unit: 'min' },
  { match: /^C$/, unit: 'C' },
];

export function canonicalUnit(raw: string): { unit: string; factor?: string } | undefined {
  const s = raw.trim();
  for (const r of RULES)
    if (r.match.test(s)) return r.factor ? { unit: r.unit, factor: r.factor } : { unit: r.unit };
  return undefined;
}

/** "94,5 Ah" -> { number: "94,5", unitRaw: "Ah" }; "0,5C" -> C-rate; text without a leading number -> number "". */
export function splitValueUnit(raw: string): { number: string; unitRaw?: string; rest: string } {
  const m = /^([-+]?\d[\d.,\s\u00a0\u202f]*)\s*([^\d\s][^\s]*(?:\s+[^\d\s][^\s]*)*)?$/.exec(
    raw.trim(),
  );
  if (!m || !/\d/.test(m[1] ?? '')) return { number: '', rest: raw.trim() };
  const number = (m[1] as string).trim();
  const unitRaw = m[2]?.trim();
  return unitRaw ? { number, unitRaw, rest: '' } : { number, rest: '' };
}

export function convertUnit(value: string, factor: string): string {
  return new Decimal(value).mul(new Decimal(factor)).toFixed();
}

/**
 * A unit written into the label: "Batteriemasse [kg]", "Rated capacity (Ah)", "Kobalt rec. %".
 * Returns the unit **as written** (e.g. `g`, `mAh`), never its canonical form, so that the
 * caller converts exactly once through `canonicalUnit` and keeps the written unit as `rawUnit`
 * (issue #9: returning `kg` here made `500 [g]` a 500 kg fact).
 */
export function unitFromLabel(label: string): string | undefined {
  const bracket = /[[(]\s*([^\])]+?)\s*[\])]\s*:?\s*$/.exec(label);
  const candidate = bracket?.[1]?.trim() ?? (/%\s*$/.test(label) ? '%' : undefined);
  return candidate && canonicalUnit(candidate) ? candidate : undefined;
}
