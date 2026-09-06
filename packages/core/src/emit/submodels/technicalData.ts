import type {
  InitialInternalResistance,
  ManufacturerInformation,
  OriginalPowerCapability,
} from '../../model/composites.js';
import { type PassportDraft, presentValue } from '../../model/passport.js';
import type * as aas from '../../vendor/aasCore.js';
import { collection, list, property } from '../elements.js';
import type { EmitIds } from '../ids.js';
import { hasAny, integral, submodelFromTemplate, templateCategory } from './shared.js';

const P = '4';
const GEN = `${P}/GeneralInformation`;
const AREAS = `${P}/TechnicalPropertyAreas`;
const CEV = `${AREAS}/CapacityEnergyVoltage`;
const RTE = `${AREAS}/RoundTripEnergyEfficiency`;
const RES = `${AREAS}/Resistance`;
const POW = `${AREAS}/PowerCapability`;
const TEMP = `${AREAS}/Temperature`;
const LIFE = `${AREAS}/Lifetime`;

/** Scalar attribute -> template path, in catalogue order; `int` marks xs:integer/unsignedInt targets. */
const SCALARS: readonly { id: string; path: string; int?: true }[] = [
  { id: 'nominalVoltage', path: `${CEV}/NominalVoltage` },
  { id: 'minimumVoltage', path: `${CEV}/MinVoltage` },
  { id: 'maximumVoltage', path: `${CEV}/MaxVoltage` },
  { id: 'ratedCapacity', path: `${CEV}/RatedCapacity` },
  { id: 'capacityFade', path: `${CEV}/CapacityFade` },
  { id: 'certifiedUsableBatteryEnergy', path: `${CEV}/CertifiedUsableBatteryEnergy` },
  {
    id: 'initialRoundTripEnergyEfficiency',
    path: `${RTE}/InitialRoundTripEnergyEfficiency`,
    int: true,
  },
  {
    id: 'roundTripEnergyEfficiencyAt50PercentCycleLife',
    path: `${RTE}/RoundTripEnergyEfficiencyAt50PercentOfCycleLife`,
    int: true,
  },
  { id: 'energyRoundTripEfficiencyFade', path: `${RTE}/EnergyRoundTripEfficiencyFade` },
  { id: 'initialSelfDischargeRate', path: `${RTE}/InitialSelfDischargingRate`, int: true },
  { id: 'internalResistanceIncrease', path: `${RES}/InternalResistanceIncreaseOfBatteryPackLevel` },
  { id: 'maximumPermittedBatteryPower', path: `${POW}/MaximumPermittedBatteryPower` },
  { id: 'powerFade', path: `${POW}/PowerFade` },
  { id: 'powerToEnergyRatio', path: `${POW}/RatioNorminalBatteryPowerAndBatteryEnergy` },
  {
    id: 'temperatureRangeIdleLowerBoundary',
    path: `${TEMP}/TemperatureRangeIdleState_LowerBoundary`,
  },
  {
    id: 'temperatureRangeIdleUpperBoundary',
    path: `${TEMP}/TemperatureRangeIdleState_UpperBoundary`,
  },
  {
    id: 'expectedLifetimeCalendarYears',
    path: `${LIFE}/ExpectedLifetimeInCalendarYears`,
    int: true,
  },
  { id: 'expectedLifetimeCycles', path: `${LIFE}/ExpectedNumberOfCycles`, int: true },
  { id: 'capacityThresholdForExhaustion', path: `${LIFE}/CapacityThresholdExhaustion` },
  { id: 'cRateOfCycleLifeTest', path: `${LIFE}/CRateOfRelevantCycleLifeTest` },
];

export const TECHNICAL_DATA_ATTRIBUTES: readonly string[] = [
  'batteryCategory',
  'batteryMass',
  'warrantyPeriod',
  'initialInternalResistance',
  'originalPowerCapability',
  ...SCALARS.map((s) => s.id),
];

/** Loose input shapes: the emitter must tolerate drafts that failed L1 (fail-honest emit). */
type ManufacturerIn = Partial<ManufacturerInformation>;
type ResistanceIn = Partial<InitialInternalResistance>;
type PowerIn = Partial<OriginalPowerCapability[number]>[];

function manufacturerName(m: ManufacturerIn | undefined): string | undefined {
  const name = m?.name;
  if (!name) return undefined;
  return name['en'] ?? name[Object.keys(name).sort()[0] ?? ''];
}

/**
 * IDTA 02035-4 Technical Data. GeneralInformation and all six property areas are always
 * emitted (the template marks them mandatory); missing leaves inside them are reported by L3
 * with their exact template path.
 */
export function emitTechnicalData(draft: PassportDraft, ids: EmitIds): aas.types.Submodel | null {
  if (!hasAny(draft, TECHNICAL_DATA_ATTRIBUTES)) return null;
  const v = <T>(id: string) => presentValue<T>(draft, id);
  const prop = (into: aas.types.ISubmodelElement[], path: string, value?: string, int?: true) => {
    if (value !== undefined) into.push(property(path, int ? integral(value) : value));
  };

  // GeneralInformation
  const general: aas.types.ISubmodelElement[] = [];
  const manufacturer = v<ManufacturerIn>('manufacturerInformation');
  prop(general, `${GEN}/ManufacturerName`, manufacturerName(manufacturer));
  prop(general, `${GEN}/ManufacturerIdentifier`, manufacturer?.identifier);
  prop(general, `${GEN}/BatteryCategory`, templateCategory(draft));
  prop(general, `${GEN}/BatteryMass`, v<string>('batteryMass'));
  const warranty = v<string>('warrantyPeriod');
  if (warranty !== undefined) {
    general.push(
      collection(`${GEN}/WarrantyInformation`, [
        property(`${GEN}/WarrantyInformation/WarrantyPeriod`, warranty),
      ]),
    );
  }

  // TechnicalPropertyAreas: one bucket per area, filled in catalogue order
  const buckets: Record<string, aas.types.ISubmodelElement[]> = {
    [CEV]: [],
    [RTE]: [],
    [RES]: [],
    [POW]: [],
    [TEMP]: [],
    [LIFE]: [],
  };
  const bucketOf = (path: string): aas.types.ISubmodelElement[] =>
    buckets[path.slice(0, path.lastIndexOf('/'))] ?? [];
  const into = (path: string, value?: string, int?: true) => prop(bucketOf(path), path, value, int);

  const resistance = v<ResistanceIn>('initialInternalResistance');
  into(`${RES}/InitialInternalResistanceOnBatteryCellLevel`, resistance?.cellOhm);
  into(`${RES}/InitialInternalResistanceOnBatteryPackLevel`, resistance?.packOhm);
  into(`${RES}/InitialInternalResistanceOnBatteryModuleLevel`, resistance?.moduleOhm);

  for (const s of SCALARS) into(s.path, v<string>(s.id), s.int);

  const power = v<PowerIn>('originalPowerCapability') ?? [];
  if (power.length > 0) {
    const AT = `${POW}/OriginalPowerCapability/PowerCapabilityAt`;
    bucketOf(`${POW}/OriginalPowerCapability`).push(
      list(
        `${POW}/OriginalPowerCapability`,
        power.map((p) => {
          const c: aas.types.ISubmodelElement[] = [];
          prop(c, `${AT}/atSoc`, p.atSocPercent, true);
          prop(c, `${AT}/powerCapabilityAt`, p.powerW);
          return collection(AT, c);
        }),
      ),
    );
  }

  const areas = collection(
    AREAS,
    Object.entries(buckets).map(([path, children]) => collection(path, children)),
  );
  return submodelFromTemplate(4, ids.submodelId('TechnicalData'), [
    collection(GEN, general),
    areas,
  ]);
}
