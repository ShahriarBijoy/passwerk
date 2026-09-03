import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { emitCarbonFootprint, PassportDraft, resolveIds, samples } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const draft = PassportDraft.parse(samples['ev-valid']);
const sm = emitCarbonFootprint(draft, resolveIds(draft));
const pcfs = sm?.submodelElements?.[0] as aas.types.SubmodelElementList | undefined;
const pcf = pcfs?.value?.[0] as aas.types.SubmodelElementCollection | undefined;
const child = (idShort: string) => pcf?.value?.find((e) => e.idShort === idShort);
const val = (e: aas.types.ISubmodelElement | undefined) =>
  (e as aas.types.Property | undefined)?.value;
const listValues = (e: aas.types.ISubmodelElement | undefined) =>
  (e as aas.types.SubmodelElementList | undefined)?.value?.map((p) => val(p));

describe('emitCarbonFootprint', () => {
  it('wraps one ProductCarbonFootprint in the list, without idShort', () => {
    expect(pcfs?.idShort).toBe('ProductCarbonFootprints');
    expect(pcfs?.value?.length).toBe(1);
    expect(pcf?.idShort).toBeNull();
  });
  it('maps the PCF value, unit, quantity and methods', () => {
    expect(val(child('PcfCO2eq'))).toBe('61.2');
    expect(val(child('ReferenceImpactUnitForCalculation'))).toBe('kWh');
    expect(val(child('QuantityOfMeasureForCalculation'))).toBe('1');
    expect(listValues(child('PcfCalculationMethods'))).toEqual(['ISO 14067:2018']);
  });
  it('lists life-cycle phases by the KB attribute name for each present share', () => {
    expect(listValues(child('LifeCyclePhases'))).toEqual([
      getAttribute('carbonFootprintShareRawMaterials')?.name.en,
      getAttribute('carbonFootprintShareManufacturing')?.name.en,
      getAttribute('carbonFootprintShareDistribution')?.name.en,
      getAttribute('carbonFootprintShareEndOfLife')?.name.en,
    ]);
  });
  it('maps performance class and study link', () => {
    expect(val(child('PerformanceClass'))).toBe('B');
    expect(listValues(child('WebLinkToPublicCarbonFootprintStudy'))).toEqual([
      'https://passport.musterwerk.example/pcf/MW-EV-2026.pdf',
    ]);
  });
  it('keeps the catalogue order inside the ProductCarbonFootprint', () => {
    expect(pcf?.value?.map((e) => e.idShort)).toEqual([
      'PcfCalculationMethods',
      'PcfCO2eq',
      'ReferenceImpactUnitForCalculation',
      'QuantityOfMeasureForCalculation',
      'LifeCyclePhases',
      'PerformanceClass',
      'WebLinkToPublicCarbonFootprintStudy',
    ]);
  });
  it('is absent for the LMT sample', () => {
    const lmt = PassportDraft.parse(samples['lmt-valid']);
    expect(emitCarbonFootprint(lmt, resolveIds(lmt))).toBeNull();
  });
});
