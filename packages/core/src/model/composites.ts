import { z } from 'zod';
import { DecimalString, MultilingualText, PercentString } from './values.js';

const Location = z.object({
  componentName: z.string().min(1).optional(),
  componentId: z.string().min(1).optional(),
});

export const ManufacturerInformation = z.object({
  name: MultilingualText,
  identifier: z.string().min(1),
  address: z
    .object({
      street: z.string().min(1).optional(),
      zipCode: z.string().min(1).optional(),
      cityTown: z.string().min(1).optional(),
      nationalCode: z.string().min(1).optional(),
      email: z.string().min(1).optional(),
      phone: z.string().min(1).optional(),
      website: z.string().min(1).optional(),
    })
    .optional(),
});
export type ManufacturerInformation = z.infer<typeof ManufacturerInformation>;

export const BatteryChemistry = z.object({
  shortName: z.string().min(1),
  clearName: z.string().min(1),
});
export type BatteryChemistry = z.infer<typeof BatteryChemistry>;

export const BatteryMaterial = z.object({
  name: z.string().min(1),
  identifier: z.string().min(1),
  massKg: DecimalString.optional(),
  location: Location.optional(),
});
export type BatteryMaterial = z.infer<typeof BatteryMaterial>;

export const HazardousSubstance = z.object({
  name: z.string().min(1),
  identifier: z.string().min(1),
  class: z.string().min(1).optional(),
  concentrationPercent: PercentString.optional(),
  location: Location.optional(),
  impacts: z.array(z.string().min(1)).optional(),
});
export type HazardousSubstance = z.infer<typeof HazardousSubstance>;

export const CarbonFootprintGeneralInformation = z.object({
  calculationMethods: z.array(z.string().min(1)).min(1),
  referenceImpactUnit: z.string().min(1).optional(),
  quantityOfMeasure: DecimalString.optional(),
});
export type CarbonFootprintGeneralInformation = z.infer<typeof CarbonFootprintGeneralInformation>;

/** Part 4: power (W) the battery can deliver at a state of charge (%). */
export const OriginalPowerCapability = z
  .array(z.object({ atSocPercent: PercentString, powerW: DecimalString }))
  .min(1);
export type OriginalPowerCapability = z.infer<typeof OriginalPowerCapability>;

/** Part 4: internal resistance in ohms per level (module recommended, not required). */
export const InitialInternalResistance = z.object({
  cellOhm: DecimalString,
  packOhm: DecimalString,
  moduleOhm: DecimalString.optional(),
});
export type InitialInternalResistance = z.infer<typeof InitialInternalResistance>;

/** Part 5: remaining power capability at a state of charge, as a percentage of the original. */
export const RemainingPowerCapability = z.object({
  atSocPercent: PercentString,
  powerPercent: PercentString,
});
export type RemainingPowerCapability = z.infer<typeof RemainingPowerCapability>;

export const SparePartComponent = z.object({
  partName: z.string().min(1),
  partNumber: z.string().min(1),
});
export type SparePartComponent = z.infer<typeof SparePartComponent>;

/** Part 7: one source of spare parts with its contact details and component list. */
export const SparePartSupplier = z.object({
  name: MultilingualText,
  address: z
    .object({
      nationalCode: z.string().min(1),
      postalCode: z.string().min(1),
      street: z.string().min(1),
    })
    .optional(),
  email: z.string().min(1).optional(),
  website: z.string().min(1).optional(),
  components: z.array(SparePartComponent).min(1).optional(),
});
export type SparePartSupplier = z.infer<typeof SparePartSupplier>;

/**
 * Explicit value shapes for composite attributes, keyed by attribute id. A leaf the shape
 * declares without `.optional()` is one the value needs to count as complete (ADR D-052).
 */
export const COMPOSITE_SCHEMAS: Record<string, z.ZodType> = {
  manufacturerInformation: ManufacturerInformation,
  batteryChemistry: BatteryChemistry,
  criticalRawMaterials: z.array(BatteryMaterial).min(1),
  electrodeAndElectrolyteMaterials: z.array(BatteryMaterial).min(1),
  hazardousSubstances: z.array(HazardousSubstance).min(1),
  carbonFootprintGeneralInformation: CarbonFootprintGeneralInformation,
  originalPowerCapability: OriginalPowerCapability,
  initialInternalResistance: InitialInternalResistance,
  remainingPowerCapability: RemainingPowerCapability,
  sparePartSources: z.array(SparePartSupplier).min(1),
  componentPartNumbers: z.array(SparePartComponent).min(1),
};

export interface CompositeCheck {
  /**
   * Dotted paths ("clearName", "0.identifier", "address.street") of required leaves that hold
   * nothing: absent, undefined, an empty list or an empty object. In shape order, no repeats.
   */
  missingLeaves: string[];
  /** Zod issues about leaves that are present but wrong (type, format, range). */
  valueIssues: z.core.$ZodIssue[];
}

const isEmptyContainer = (v: unknown): boolean =>
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);

/** Own-property read along `path`; undefined as soon as a step is missing. */
function valueAt(value: unknown, path: readonly PropertyKey[]): unknown {
  let cursor: unknown = value;
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    if (!Object.hasOwn(cursor, key)) return undefined;
    cursor = (cursor as Record<PropertyKey, unknown>)[key];
  }
  return cursor;
}

/**
 * Split a composite value's problems into missing leaves and wrong leaves (ADR D-052). A leaf
 * the documents simply did not hold is not a wrong value: it is reported as missing, and every
 * leaf that is present is still checked by the full shape. The root itself is never "missing"
 * (an empty or non-object value is a value issue), so a present field always says why.
 * Returns `null` for a composite without a modelled shape.
 */
export function checkComposite(attributeId: string, value: unknown): CompositeCheck | null {
  const shape = COMPOSITE_SCHEMAS[attributeId];
  if (!shape) return null;
  const r = shape.safeParse(value);
  if (r.success) return { missingLeaves: [], valueIssues: [] };
  const missing: string[] = [];
  const valueIssues: z.core.$ZodIssue[] = [];
  for (const issue of r.error.issues) {
    const at = valueAt(value, issue.path);
    if (issue.path.length > 0 && (at === undefined || isEmptyContainer(at))) {
      const leaf = issue.path.map(String).join('.');
      if (!missing.includes(leaf)) missing.push(leaf);
    } else {
      valueIssues.push(issue);
    }
  }
  return { missingLeaves: missing, valueIssues };
}
