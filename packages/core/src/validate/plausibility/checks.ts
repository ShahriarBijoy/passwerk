import { type BatteryCategory, getAttribute, getRule } from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import type { RuleContext } from './context.js';

export interface RuleViolation {
  /** Draft path. Defaults to `attributes.<attributeId>.value`. */
  path?: string;
  attributeId?: string;
  /**
   * Values for the named placeholders the rule's DE/EN message uses. A `{ de, en }` value is
   * resolved per language, so a translated noun (a material name, say) reads correctly in both.
   */
  params?: Record<string, string | { de: string; en: string }>;
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

/** CAS registry number: NN..N-NN-C, where C is a modulo-10 weighted check digit. */
export function isCasNumber(value: string): boolean {
  const match = /^(\d{2,7})-(\d{2})-(\d)$/.exec(value);
  if (!match) return false;
  const digits = `${match[1]}${match[2]}`.split('').reverse();
  const sum = digits.reduce((acc, digit, index) => acc + Number(digit) * (index + 1), 0);
  return sum % 10 === Number(match[3]);
}

/** The four materials with a recycled-content obligation, with their attribute pair. */
const RECYCLED_PAIRS: {
  material: { de: string; en: string };
  pre: string;
  post: string;
}[] = [
  {
    material: { de: 'Nickel', en: 'Nickel' },
    pre: 'recycledNickelPreConsumer',
    post: 'recycledNickelPostConsumer',
  },
  {
    material: { de: 'Kobalt', en: 'Cobalt' },
    pre: 'recycledCobaltPreConsumer',
    post: 'recycledCobaltPostConsumer',
  },
  {
    material: { de: 'Lithium', en: 'Lithium' },
    pre: 'recycledLithiumPreConsumer',
    post: 'recycledLithiumPostConsumer',
  },
  {
    material: { de: 'Blei', en: 'Lead' },
    pre: 'recycledLeadPreConsumer',
    post: 'recycledLeadPostConsumer',
  },
];

/** Above this, an internal resistance in ohms is almost certainly stated in milliohms. */
const INTERNAL_RESISTANCE_OHM_LIMIT = 10;

/**
 * True when the template forces the element to be present, so the supplier has no choice.
 * The catalogue stores a numeric `cardinality.min` even for "One" (min: 1, max: 1), so
 * comparing `min >= 1` works directly; `raw` is not needed as a fallback (verified against
 * kb/generated/template-catalogue.json for 5/RemainingCapacity/RemainingCapacityValue).
 */
function templateForcesPresence(attributeId: string): boolean {
  const attribute = getAttribute(attributeId);
  if (!attribute) return false;
  return attribute.templateElements.some(
    (element) => element.cardinality.min !== null && element.cardinality.min >= 1,
  );
}

/**
 * Tolerances. These are engineering judgement, not values stated in the Regulation: they
 * decide how noisy L4 feels on real supplier data. Tune here, in one place.
 */
export const ENERGY_COHERENCE_TOLERANCE = 0.2; // 20 % of the derived energy
export const SHARE_SUM_TOLERANCE_PP = 1; // percentage points around 100
export const CAPACITY_FADE_TOLERANCE_PP = 1; // percentage points

/** Remaining/original attribute pairs checked by PW-PLAUS-020. */
const REMAINING_PAIRS: { remaining: string; original: string }[] = [
  { remaining: 'remainingCapacity', original: 'ratedCapacity' },
  { remaining: 'remainingUsableBatteryEnergy', original: 'certifiedUsableBatteryEnergy' },
  {
    remaining: 'remainingRoundTripEnergyEfficiency',
    original: 'initialRoundTripEnergyEfficiency',
  },
];

/** Sum the massKg entries of a composite material list. */
function sumMassKg(items: unknown): Decimal | undefined {
  if (!Array.isArray(items)) return undefined;
  let total = new Decimal(0);
  let seen = false;
  for (const item of items) {
    const raw = (item as { massKg?: unknown })?.massKg;
    if (typeof raw !== 'string') continue;
    try {
      const d = new Decimal(raw);
      if (!d.isFinite()) continue;
      total = total.plus(d);
      seen = true;
    } catch {
      /* a malformed mass is L1's problem, not L4's */
    }
  }
  return seen ? total : undefined;
}

/** Minutes in a day, for the age arithmetic of PW-PLAUS-025. */
const MINUTES_PER_DAY = 1440;

/** Whole days between two ISO dates, computed from the calendar, never from a Date object. */
export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const toDays = (iso: string): number => {
    // Cast to a fixed-length tuple: the ISO date shape is guaranteed by the callers
    // (RuleContext.date and asOf.slice(0, 10)), and noUncheckedIndexedAccess otherwise
    // treats each destructured element of a plain number[] as possibly undefined.
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    // Days since the epoch by the civil-from-days algorithm: no Date, no timezone.
    const year = m <= 2 ? y - 1 : y;
    const era = Math.floor(year / 400);
    const yoe = year - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  };
  return toDays(toIsoDate) - toDays(fromIsoDate);
}

/** `IsoDateTime` shape: date, time (seconds and fraction optional), then Z or a ±HH:MM offset. */
const ISO_DATETIME_PARTS =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * UTC milliseconds for an `IsoDateTime`, or undefined when the string is not one. Timestamps
 * must be compared as instants, never lexically: `IsoDateTime` admits offsets and a
 * second-less form, so `2026-09-03T13:00:00+02:00` sorts after `2026-09-03T12:00:00Z` as a
 * string while being an hour earlier as an instant. Built on `daysBetween`, so still no
 * `Date` and no timezone of the host (core is browser-safe; ADR D-006).
 */
export function isoDateTimeToEpochMs(value: string): number | undefined {
  const m = ISO_DATETIME_PARTS.exec(value);
  if (!m) return undefined;
  // The regex groups are fixed by the pattern above; noUncheckedIndexedAccess cannot see that.
  const [, date, hh, mm, ss, frac, zone, sign, offHh, offMm] = m as unknown as [
    string,
    string,
    string,
    string,
    string | undefined,
    string | undefined,
    string,
    string | undefined,
    string | undefined,
    string | undefined,
  ];
  // Milliseconds: pad or truncate the authored fraction to exactly three digits.
  const ms = frac === undefined ? 0 : Number(`${frac}000`.slice(0, 3));
  const offsetMinutes =
    zone === 'Z' ? 0 : (sign === '-' ? -1 : 1) * (Number(offHh) * 60 + Number(offMm));
  return (
    daysBetween('1970-01-01', date) * 86_400_000 +
    Number(hh) * 3_600_000 +
    Number(mm) * 60_000 +
    Number(ss ?? 0) * 1000 +
    ms -
    offsetMinutes * 60_000
  );
}

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

  /** Material identifiers should be CAS registry numbers. */
  'PW-PLAUS-009': (ctx) => {
    const out: RuleViolation[] = [];
    for (const id of ruleAttributes('PW-PLAUS-009')) {
      const items = ctx.value<{ identifier?: unknown }[]>(id);
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const identifier = item?.identifier;
        if (typeof identifier !== 'string' || isCasNumber(identifier)) continue;
        out.push({ attributeId: id, params: { value: identifier } });
      }
    }
    return out;
  },

  /** Pre- and post-consumer recycled shares of one material must not exceed 100 % together. */
  'PW-PLAUS-010': (ctx) => {
    const out: RuleViolation[] = [];
    for (const { material, pre, post } of RECYCLED_PAIRS) {
      const preShare = ctx.decimal(pre);
      const postShare = ctx.decimal(post);
      if (preShare === undefined || postShare === undefined) continue;
      const sum = preShare.plus(postShare);
      if (sum.lte(100)) continue;
      out.push({
        attributeId: pre,
        params: {
          material,
          pre: preShare.toString(),
          post: postShare.toString(),
          sum: sum.toString(),
        },
      });
    }
    return out;
  },

  /** A dynamic value needs a LastUpdate timestamp that is not in the future. */
  'PW-PLAUS-011': (ctx) => {
    const out: RuleViolation[] = [];
    for (const id of ruleAttributes('PW-PLAUS-011')) {
      if (ctx.value(id) === undefined) continue;
      const recordedAt = ctx.recordedAt(id);
      // Compare instants, not strings. An unparseable stamp on either side is treated the
      // same as a missing one: fire, rather than silently pass an unverifiable timestamp.
      const recordedMs = recordedAt === undefined ? undefined : isoDateTimeToEpochMs(recordedAt);
      const asOfMs = isoDateTimeToEpochMs(ctx.asOf);
      if (recordedMs !== undefined && asOfMs !== undefined && recordedMs <= asOfMs) continue;
      out.push({ attributeId: id, params: { attribute: id, timestamp: recordedAt ?? '-' } });
    }
    return out;
  },

  /**
   * Data points the Commission marks 'not to be filled/displayed' should be empty — unless
   * the IDTA template makes the element mandatory, in which case the supplier has no choice
   * and we stay quiet (ADR D-023).
   */
  'PW-PLAUS-012': (ctx) => {
    const out: RuleViolation[] = [];
    for (const id of ruleAttributes('PW-PLAUS-012')) {
      if (ctx.value(id) === undefined) continue;
      const attribute = getAttribute(id);
      if (attribute?.applicability[ctx.category].status !== 'not_displayed') continue;
      if (templateForcesPresence(id)) continue;
      out.push({ attributeId: id, params: { attribute: id, category: ctx.category } });
    }
    return out;
  },

  /** An internal resistance above 10 ohms is almost certainly stated in milliohms. */
  'PW-PLAUS-014': (ctx) => {
    const value = ctx.value<Record<string, unknown>>('initialInternalResistance');
    if (typeof value !== 'object' || value === null) return [];
    const out: RuleViolation[] = [];
    for (const key of ['cellOhm', 'moduleOhm', 'packOhm']) {
      const raw = value[key];
      if (typeof raw !== 'string') continue;
      let ohms: Decimal;
      try {
        ohms = new Decimal(raw);
      } catch {
        continue;
      }
      if (!ohms.isFinite() || ohms.lte(INTERNAL_RESISTANCE_OHM_LIMIT)) continue;
      out.push({
        attributeId: 'initialInternalResistance',
        path: `attributes.initialInternalResistance.value.${key}`,
        params: { value: ohms.toString() },
      });
    }
    return out;
  },

  /** The idle temperature range must have its lower boundary below the upper. */
  'PW-PLAUS-015': (ctx) => {
    const lower = ctx.decimal('temperatureRangeIdleLowerBoundary');
    const upper = ctx.decimal('temperatureRangeIdleUpperBoundary');
    if (lower === undefined || upper === undefined || lower.lt(upper)) return [];
    return [
      {
        attributeId: 'temperatureRangeIdleLowerBoundary',
        params: { lower: lower.toString(), upper: upper.toString() },
      },
    ];
  },

  /** Certified usable energy must be within tolerance of rated capacity times nominal voltage. */
  'PW-PLAUS-016': (ctx) => {
    const capacity = ctx.decimal('ratedCapacity');
    const voltage = ctx.decimal('nominalVoltage');
    const declared = ctx.decimal('certifiedUsableBatteryEnergy');
    if (capacity === undefined || voltage === undefined || declared === undefined) return [];
    const derived = capacity.times(voltage).div(1000);
    if (derived.isZero()) return [];
    if (declared.minus(derived).abs().div(derived).lte(ENERGY_COHERENCE_TOLERANCE)) return [];
    return [
      {
        attributeId: 'certifiedUsableBatteryEnergy',
        params: {
          declared: declared.toString(),
          derived: derived.toDecimalPlaces(3).toString(),
        },
      },
    ];
  },

  /** The four life-cycle shares should add up to about 100 %. */
  'PW-PLAUS-017': (ctx) => {
    const ids = ruleAttributes('PW-PLAUS-017');
    const shares = ids.map((id) => ctx.decimal(id)).filter((d): d is Decimal => d !== undefined);
    if (shares.length < 3) return [];
    const sum = shares.reduce((acc, d) => acc.plus(d), new Decimal(0));
    if (sum.minus(100).abs().lte(SHARE_SUM_TOLERANCE_PP)) return [];
    return [
      {
        attributeId: 'carbonFootprintShareRawMaterials',
        params: { sum: sum.toDecimalPlaces(2).toString() },
      },
    ];
  },

  /** The declared material masses must not outweigh the battery. */
  'PW-PLAUS-018': (ctx) => {
    const mass = ctx.decimal('batteryMass');
    if (mass === undefined) return [];
    const parts = [
      sumMassKg(ctx.value('criticalRawMaterials')),
      sumMassKg(ctx.value('electrodeAndElectrolyteMaterials')),
    ].filter((d): d is Decimal => d !== undefined);
    if (parts.length === 0) return [];
    const sum = parts.reduce((acc, d) => acc.plus(d), new Decimal(0));
    if (sum.lte(mass)) return [];
    return [
      {
        attributeId: 'batteryMass',
        params: { sum: sum.toDecimalPlaces(3).toString(), mass: mass.toString() },
      },
    ];
  },

  /** Hazardous substance concentrations must not exceed 100 % together. */
  'PW-PLAUS-019': (ctx) => {
    const items = ctx.value<{ concentrationPercent?: unknown }[]>('hazardousSubstances');
    if (!Array.isArray(items)) return [];
    let sum = new Decimal(0);
    let seen = false;
    for (const item of items) {
      const raw = item?.concentrationPercent;
      if (typeof raw !== 'string') continue;
      try {
        const d = new Decimal(raw);
        if (!d.isFinite()) continue;
        sum = sum.plus(d);
        seen = true;
      } catch {
        /* malformed concentration is L1's problem */
      }
    }
    if (!seen || sum.lte(100)) return [];
    return [
      { attributeId: 'hazardousSubstances', params: { sum: sum.toDecimalPlaces(2).toString() } },
    ];
  },

  /** No remaining value may exceed its original counterpart. */
  'PW-PLAUS-020': (ctx) => {
    const out: RuleViolation[] = [];
    for (const { remaining, original } of REMAINING_PAIRS) {
      const now = ctx.decimal(remaining);
      const then = ctx.decimal(original);
      if (now === undefined || then === undefined || now.lte(then)) continue;
      out.push({
        attributeId: remaining,
        params: {
          pair: `${remaining} / ${original}`,
          remaining: now.toString(),
          original: then.toString(),
        },
      });
    }
    return out;
  },

  /** Round trip efficiency must not rise between the initial value and 50 % of cycle life. */
  'PW-PLAUS-021': (ctx) => {
    const initial = ctx.decimal('initialRoundTripEnergyEfficiency');
    const later = ctx.decimal('roundTripEnergyEfficiencyAt50PercentCycleLife');
    if (initial === undefined || later === undefined || later.lte(initial)) return [];
    return [
      {
        attributeId: 'roundTripEnergyEfficiencyAt50PercentCycleLife',
        params: { later: later.toString(), initial: initial.toString() },
      },
    ];
  },

  /** Declared capacity fade must match the rated and remaining capacities. */
  'PW-PLAUS-022': (ctx) => {
    const rated = ctx.decimal('ratedCapacity');
    const remaining = ctx.decimal('remainingCapacity');
    const declared = ctx.decimal('capacityFade');
    if (rated === undefined || remaining === undefined || declared === undefined) return [];
    if (rated.isZero()) return [];
    const derived = new Decimal(1).minus(remaining.div(rated)).times(100);
    if (declared.minus(derived).abs().lte(CAPACITY_FADE_TOLERANCE_PP)) return [];
    return [
      {
        attributeId: 'capacityFade',
        params: {
          declared: declared.toString(),
          derived: derived.toDecimalPlaces(2).toString(),
        },
      },
    ];
  },

  /** The cycle count must not exceed the expected lifetime in cycles. */
  'PW-PLAUS-023': (ctx) => {
    const cycles = ctx.decimal('numberOfFullCycles');
    const expected = ctx.decimal('expectedLifetimeCycles');
    if (cycles === undefined || expected === undefined || cycles.lte(expected)) return [];
    return [
      {
        attributeId: 'numberOfFullCycles',
        params: { cycles: cycles.toString(), expected: expected.toString() },
      },
    ];
  },

  /** A declared carbon footprint needs its calculation method and a link to the study. */
  'PW-PLAUS-024': (ctx) => {
    if (ctx.value('carbonFootprintPerFunctionalUnit') === undefined) return [];
    const out: RuleViolation[] = [];
    const general = ctx.value<{ calculationMethods?: unknown }>(
      'carbonFootprintGeneralInformation',
    );
    const methods = general?.calculationMethods;
    if (!Array.isArray(methods) || methods.length === 0) {
      out.push({
        attributeId: 'carbonFootprintGeneralInformation',
        params: { missing: 'carbonFootprintGeneralInformation.calculationMethods' },
      });
    }
    const study = ctx.value<unknown[]>('carbonFootprintStudyLink');
    if (!Array.isArray(study) || study.length === 0) {
      out.push({
        attributeId: 'carbonFootprintStudyLink',
        params: { missing: 'carbonFootprintStudyLink' },
      });
    }
    return out;
  },

  /** Extreme-temperature exposure cannot exceed the time the battery has been in service. */
  'PW-PLAUS-025': (ctx) => {
    const inService = ctx.date('dateOfPuttingIntoService');
    if (inService === undefined) return [];
    const ids = [
      'timeInExtremeHighTemperature',
      'timeInExtremeLowTemperature',
      'timeChargingInExtremeHighTemperature',
      'timeChargingInExtremeLowTemperature',
    ];
    const values = ids.map((id) => ctx.decimal(id)).filter((d): d is Decimal => d !== undefined);
    if (values.length === 0) return [];
    const minutes = values.reduce((acc, d) => acc.plus(d), new Decimal(0));
    const ageDays = daysBetween(inService, ctx.asOf.slice(0, 10));
    if (ageDays < 0) return []; // a service date after asOf is PW-PLAUS-003's business
    const ageMinutes = new Decimal(ageDays).times(MINUTES_PER_DAY);
    if (minutes.lte(ageMinutes)) return [];
    return [
      {
        attributeId: 'timeInExtremeHighTemperature',
        params: { minutes: minutes.toString(), ageMinutes: ageMinutes.toString() },
      },
    ];
  },
};
