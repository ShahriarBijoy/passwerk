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

/** Explicit value shapes for composite attributes, keyed by attribute id. */
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
