import { entriesFor, synonymIndex } from '@passwerk/core';
import { attributes } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('synonymIndex', () => {
  it('has name, synonym, concept and id entries for every attribute, normalised', () => {
    const index = synonymIndex();
    // Ruling 2: for these attributes the split id coincides with the English name key (ids in
    // this KB are largely camelCased English names), so dedupe keeps the higher-weight `name`
    // entry and no separate `id` entry survives. Computed once via a scratch run; see the report.
    const idNameCollision = new Set([
      'batteryPassportIdentifier',
      'batteryIdentifier',
      'manufacturingPlace',
      'manufacturingDate',
      'dateOfPuttingIntoService',
      'warrantyPeriod',
      'batteryCategory',
      'batteryMass',
      'batteryStatus',
      'separateCollectionSymbol',
      'cadmiumLeadSymbols',
      'carbonFootprintLabel',
      'extinguishingAgent',
      'meaningOfLabelsAndSymbols',
      'euDeclarationOfConformity',
      'carbonFootprintShareDistribution',
      'carbonFootprintPerformanceClass',
      'dueDiligenceReport',
      'supplyChainIndices',
      'batteryChemistry',
      'criticalRawMaterials',
      'hazardousSubstances',
      'sparePartSources',
      'safetyMeasures',
      'renewableContentShare',
      'ratedCapacity',
      'remainingCapacity',
      'capacityFade',
      'certifiedUsableBatteryEnergy',
      'remainingUsableBatteryEnergy',
      'stateOfCertifiedEnergy',
      'stateOfCharge',
      'minimumVoltage',
      'maximumVoltage',
      'nominalVoltage',
      'originalPowerCapability',
      'remainingPowerCapability',
      'powerFade',
      'maximumPermittedBatteryPower',
      'powerToEnergyRatio',
      'initialRoundTripEnergyEfficiency',
      'remainingRoundTripEnergyEfficiency',
      'energyRoundTripEfficiencyFade',
      'initialSelfDischargeRate',
      'currentSelfDischargeRate',
      'initialInternalResistance',
      'internalResistanceIncrease',
      'expectedLifetimeCalendarYears',
      'numberOfFullCycles',
      'cycleLifeReferenceTest',
      'energyThroughput',
      'capacityThroughput',
      'capacityThresholdForExhaustion',
      'temperatureInformation',
      'timeInExtremeHighTemperature',
      'timeInExtremeLowTemperature',
      'deepDischargeEvents',
      'overchargeEvents',
      'informationOnAccidents',
    ]);
    for (const a of attributes) {
      const mine = entriesFor(a.id);
      expect(
        mine.some((e) => e.origin === 'name' && e.weight === 1),
        a.id,
      ).toBe(true);
      expect(
        mine.some((e) => e.origin === 'synonym' && e.weight === 0.95),
        a.id,
      ).toBe(true);
      if (idNameCollision.has(a.id)) {
        expect(
          mine.some((e) => (e.origin === 'id' || e.origin === 'name') && e.weight >= 0.7),
          a.id,
        ).toBe(true);
      } else {
        expect(
          mine.some((e) => e.origin === 'id' && e.weight === 0.7),
          a.id,
        ).toBe(true);
      }
      for (const e of mine) expect(e.key, `${a.id} ${e.text}`).toBe(e.key.toLowerCase().trim());
    }
    expect(index.length).toBeGreaterThan(attributes.length * 4);
  });
  it('the id entry splits camel case', () => {
    expect(entriesFor('recycledCobaltPostConsumer').find((e) => e.origin === 'id')?.key).toBe(
      'recycled cobalt post consumer',
    );
  });
  it('is memoised', () => {
    expect(synonymIndex()).toBe(synonymIndex());
  });
});
