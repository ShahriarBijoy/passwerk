import { type BatteryCategory, getRule } from '@passwerk/rules';
import type { RuleContext } from './context.js';

export interface RuleViolation {
  /** Draft path. Defaults to `attributes.<attributeId>.value`. */
  path?: string;
  attributeId?: string;
  /** Values for the named placeholders the rule's DE/EN message uses. */
  params?: Record<string, string>;
}

export type RuleCheck = (ctx: RuleContext) => RuleViolation[];

/** The attribute ids a rule declares in the knowledge base. */
export function ruleAttributes(ruleId: string): readonly string[] {
  const rule = getRule(ruleId);
  if (!rule) throw new Error(`@passwerk/core: unknown rule ${ruleId}`);
  return rule.attributes;
}

/** Typical pack masses per category, as stated in the PW-PLAUS-004 message. */
const MASS_RANGES: Record<BatteryCategory, { min: number; max: number }> = {
  LMT: { min: 1, max: 50 },
  EV: { min: 100, max: 1500 },
  INDUSTRIAL_GT_2KWH: { min: 10, max: 50000 },
};

/** The five statuses of BR Annex XIII 4(c), normalised for comparison. */
const BATTERY_STATUSES = new Set(['original', 'repurposed', 'reused', 'remanufactured', 'waste']);

const normaliseStatus = (s: string): string => s.trim().toLowerCase().replaceAll('-', '');

/** One check per PW-PLAUS rule id. Keys must match kb/rules.json exactly (see manifest test). */
export const CHECKS: Record<string, RuleCheck> = {
  /** Listed percentages must lie between 0 and 100. */
  'PW-PLAUS-001': (ctx) => {
    const out: RuleViolation[] = [];
    for (const id of ruleAttributes('PW-PLAUS-001')) {
      const d = ctx.decimal(id);
      if (d === undefined) continue;
      if (d.gte(0) && d.lte(100)) continue;
      out.push({ attributeId: id, params: { attribute: id, value: d.toString() } });
    }
    return out;
  },

  /** minimum <= nominal <= maximum voltage. Needs all three to say anything. */
  'PW-PLAUS-002': (ctx) => {
    const min = ctx.decimal('minimumVoltage');
    const nom = ctx.decimal('nominalVoltage');
    const max = ctx.decimal('maximumVoltage');
    if (min === undefined || nom === undefined || max === undefined) return [];
    if (min.lte(nom) && nom.lte(max)) return [];
    return [
      {
        attributeId: 'nominalVoltage',
        params: { min: min.toString(), nom: nom.toString(), max: max.toString() },
      },
    ];
  },

  /** Manufacturing date: not in the future, not before 2000, not after putting into service. */
  'PW-PLAUS-003': (ctx) => {
    const mfg = ctx.date('manufacturingDate');
    if (mfg === undefined) return [];
    const svc = ctx.date('dateOfPuttingIntoService');
    const today = ctx.asOf.slice(0, 10);
    const implausible = mfg > today || mfg < '2000-01-01' || (svc !== undefined && mfg > svc);
    if (!implausible) return [];
    return [
      {
        attributeId: 'manufacturingDate',
        params: { manufacturingDate: mfg, dateOfPuttingIntoService: svc ?? '-' },
      },
    ];
  },

  /** Battery mass within the typical band for the category. */
  'PW-PLAUS-004': (ctx) => {
    const mass = ctx.decimal('batteryMass');
    if (mass === undefined) return [];
    const band = MASS_RANGES[ctx.category];
    if (mass.gte(band.min) && mass.lte(band.max)) return [];
    return [
      { attributeId: 'batteryMass', params: { value: mass.toString(), category: ctx.category } },
    ];
  },

  /** An industrial battery in passport scope must exceed 2 kWh. */
  'PW-PLAUS-005': (ctx) => {
    if (ctx.category !== 'INDUSTRIAL_GT_2KWH') return [];
    const capacity = ctx.decimal('ratedCapacity');
    const voltage = ctx.decimal('nominalVoltage');
    if (capacity === undefined || voltage === undefined) return [];
    const energy = capacity.times(voltage).div(1000);
    if (energy.gt(2)) return [];
    return [
      {
        attributeId: 'ratedCapacity',
        params: {
          capacity: capacity.toString(),
          voltage: voltage.toString(),
          energy: energy.toDecimalPlaces(3).toString(),
        },
      },
    ];
  },

  /** Battery status is one of the five defined values. */
  'PW-PLAUS-006': (ctx) => {
    const status = ctx.value<unknown>('batteryStatus');
    if (typeof status !== 'string') return [];
    if (BATTERY_STATUSES.has(normaliseStatus(status))) return [];
    return [{ attributeId: 'batteryStatus', params: { value: status } }];
  },

  /** The batteryCategory attribute matches the category the draft is validated as. */
  'PW-PLAUS-007': (ctx) => {
    const value = ctx.value<unknown>('batteryCategory');
    if (typeof value !== 'string') return [];
    if (value.trim().toUpperCase() === ctx.category) return [];
    return [{ attributeId: 'batteryCategory', params: { draftCategory: ctx.category, value } }];
  },

  /** The passport identifier must be an absolute https URI a QR code can resolve. */
  'PW-PLAUS-008': (ctx) => {
    const value = ctx.value<unknown>('batteryPassportIdentifier');
    if (typeof value !== 'string') return [];
    if (/^https:\/\/\S+$/.test(value)) return [];
    return [{ attributeId: 'batteryPassportIdentifier', params: { value } }];
  },
};
