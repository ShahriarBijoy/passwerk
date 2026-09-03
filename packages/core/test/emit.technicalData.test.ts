import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { emitTechnicalData, PassportDraft, resolveIds, samples } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

type SMC = aas.types.SubmodelElementCollection;
type SML = aas.types.SubmodelElementList;

const ev = PassportDraft.parse(samples['ev-valid']);
const sm = emitTechnicalData(ev, resolveIds(ev));
const root = (idShort: string) => sm?.submodelElements?.find((e) => e.idShort === idShort);
const child = (parent: aas.types.ISubmodelElement | undefined, idShort: string) =>
  (parent as SMC | undefined)?.value?.find((e) => e.idShort === idShort);
const val = (e: aas.types.ISubmodelElement | undefined) =>
  (e as aas.types.Property | undefined)?.value;

const general = root('GeneralInformation');
const areas = root('TechnicalPropertyAreas');

describe('emitTechnicalData', () => {
  it('emits GeneralInformation and TechnicalPropertyAreas, in that order', () => {
    expect(sm?.idShort).toBe('TechnicalData');
    expect(sm?.submodelElements?.map((e) => e.idShort)).toEqual([
      'GeneralInformation',
      'TechnicalPropertyAreas',
    ]);
  });

  it('fills GeneralInformation from the manufacturer, category, mass and warranty', () => {
    expect(val(child(general, 'ManufacturerName'))).toBe('Musterwerk Battery Systems GmbH');
    expect(val(child(general, 'ManufacturerIdentifier'))).toBe('DE-MW-0001');
    expect(val(child(general, 'BatteryCategory'))).toBe('ev');
    expect(val(child(general, 'BatteryMass'))).toBe('412.5');
    expect(val(child(child(general, 'WarrantyInformation'), 'WarrantyPeriod'))).toBe(
      '8 years or 160000 km',
    );
  });

  it('emits the six property areas in catalogue order', () => {
    expect((areas as SMC | undefined)?.value?.map((e) => e.idShort)).toEqual([
      'CapacityEnergyVoltage',
      'RoundTripEnergyEfficiency',
      'Resistance',
      'PowerCapability',
      'Temperature',
      'Lifetime',
    ]);
  });

  it('maps scalar attributes to their properties', () => {
    const cev = child(areas, 'CapacityEnergyVoltage');
    expect(val(child(cev, 'NominalVoltage'))).toBe('400');
    expect(val(child(cev, 'MinVoltage'))).toBe('300');
    expect(val(child(cev, 'MaxVoltage'))).toBe('456');
    expect(val(child(cev, 'RatedCapacity'))).toBe('195');
    expect(val(child(cev, 'CertifiedUsableBatteryEnergy'))).toBe('75');
    const rte = child(areas, 'RoundTripEnergyEfficiency');
    expect(val(child(rte, 'InitialRoundTripEnergyEfficiency'))).toBe('96');
    expect(val(child(rte, 'InitialSelfDischargingRate'))).toBe('2');
    const res = child(areas, 'Resistance');
    expect(val(child(res, 'InitialInternalResistanceOnBatteryCellLevel'))).toBe('0.0012');
    expect(val(child(res, 'InitialInternalResistanceOnBatteryPackLevel'))).toBe('0.085');
    expect(val(child(res, 'InitialInternalResistanceOnBatteryModuleLevel'))).toBe('0.011');
    expect(val(child(res, 'InternalResistanceIncreaseOfBatteryPackLevel'))).toBe('0');
    expect(child(res, 'InternalResistanceIncreaseOfBatteryCellLevel')).toBeUndefined();
    const temp = child(areas, 'Temperature');
    expect(val(child(temp, 'TemperatureRangeIdleState_LowerBoundary'))).toBe('-30');
    const life = child(areas, 'Lifetime');
    expect(val(child(life, 'ExpectedNumberOfCycles'))).toBe('2500');
    expect(val(child(life, 'CRateOfRelevantCycleLifeTest'))).toBe('0.5');
  });

  it('emits one PowerCapabilityAt collection per original power capability item, without idShort', () => {
    const power = child(areas, 'PowerCapability');
    expect(val(child(power, 'MaximumPermittedBatteryPower'))).toBe('250000');
    const list = child(power, 'OriginalPowerCapability') as SML | undefined;
    expect(list?.value?.length).toBe(2);
    const first = list?.value?.[0] as SMC | undefined;
    expect(first?.idShort).toBeNull();
    expect(val(child(first, 'atSoc'))).toBe('80');
    expect(val(child(first, 'powerCapabilityAt'))).toBe('250000');
  });

  it('normalises integer-typed properties to their integral form', () => {
    const draft = PassportDraft.parse({
      ...samples['ev-valid'],
      attributes: {
        expectedLifetimeCycles: { value: '2500.0', status: 'present' },
        originalPowerCapability: {
          value: [{ atSocPercent: '80.0', powerW: '1.5' }],
          status: 'present',
        },
      },
    });
    const out = emitTechnicalData(draft, resolveIds(draft));
    const a = out?.submodelElements?.find((e) => e.idShort === 'TechnicalPropertyAreas');
    expect(val(child(child(a, 'Lifetime'), 'ExpectedNumberOfCycles'))).toBe('2500');
    const at = (child(child(a, 'PowerCapability'), 'OriginalPowerCapability') as SML | undefined)
      ?.value?.[0];
    expect(val(child(at, 'atSoc'))).toBe('80');
    expect(val(child(at, 'powerCapabilityAt'))).toBe('1.5');
  });

  it('always emits every property area so L3 can name the missing leaf', () => {
    const draft = PassportDraft.parse({
      ...samples['ev-valid'],
      attributes: { ratedCapacity: { value: '195', status: 'present' } },
    });
    const out = emitTechnicalData(draft, resolveIds(draft));
    const a = out?.submodelElements?.find((e) => e.idShort === 'TechnicalPropertyAreas') as
      | SMC
      | undefined;
    expect(a?.value?.map((e) => e.idShort)).toEqual([
      'CapacityEnergyVoltage',
      'RoundTripEnergyEfficiency',
      'Resistance',
      'PowerCapability',
      'Temperature',
      'Lifetime',
    ]);
    expect(child(child(a, 'CapacityEnergyVoltage'), 'NominalVoltage')).toBeUndefined();
    expect(child(out?.submodelElements?.[0], 'WarrantyInformation')).toBeUndefined();
  });

  it('is absent when the draft has no technical data', () => {
    const draft = PassportDraft.parse({
      ...samples['ev-valid'],
      attributes: {
        manufacturerInformation: samples['ev-valid'].attributes['manufacturerInformation'],
      },
    });
    expect(emitTechnicalData(draft, resolveIds(draft))).toBeNull();
  });
});
