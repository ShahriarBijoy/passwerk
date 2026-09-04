import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { emitProductCondition, PassportDraft, resolveIds, samples } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

type SMC = aas.types.SubmodelElementCollection;
type SML = aas.types.SubmodelElementList;

const ev = PassportDraft.parse(samples['ev-valid']);
const sm = emitProductCondition(ev, resolveIds(ev));
const root = (idShort: string) => sm?.submodelElements?.find((e) => e.idShort === idShort);
const child = (parent: aas.types.ISubmodelElement | undefined, idShort: string) =>
  (parent as SMC | undefined)?.value?.find((e) => e.idShort === idShort);
const val = (e: aas.types.ISubmodelElement | undefined) =>
  (e as aas.types.Property | undefined)?.value;

describe('emitProductCondition', () => {
  it('emits every present block in catalogue order', () => {
    expect(sm?.idShort).toBe('ProductCondition');
    expect(sm?.submodelElements?.map((e) => e.idShort)).toEqual([
      'EnergyThroughput',
      'StateOfCharge',
      'CapacityThroughput',
      'NumberOfFullCycles',
      'StateOfCertifiedEnergy',
      'RemainingEnergy',
      'RemainingCapacity',
      'NegativeEvents',
      'InformationOnAccidents',
      'TemperatureInformation',
      'RemainingPowerCapability',
      'EvolutionOfSelfDischarge',
      'CurrentSelfDischargingRate',
      'RemainingRoundTripEnergyEfficiency',
    ]);
  });

  it('pairs each value with its LastUpdate from recordedAt', () => {
    const soc = root('StateOfCharge');
    expect(val(child(soc, 'StateOfChargeValue'))).toBe('70');
    expect(val(child(soc, 'LastUpdate'))).toBe('2026-08-31T06:00:00Z');
    const cycles = root('NumberOfFullCycles');
    expect(val(child(cycles, 'NumberOfFullCyclesValue'))).toBe('12');
    expect(val(child(cycles, 'LastUpdate'))).toBe('2026-08-30T18:30:00Z');
    expect(val(child(root('RemainingEnergy'), 'RemainingEnergyValue'))).toBe('74.6');
    expect(val(child(root('EvolutionOfSelfDischarge'), 'EvolutionOfSelfDischargeValue'))).toBe('0');
  });

  it('emits one NegativeEvent per counter attribute, named after the KB attribute', () => {
    const events = root('NegativeEvents') as SML | undefined;
    expect(events?.value?.length).toBe(2);
    const first = events?.value?.[0] as SMC | undefined;
    expect(first?.idShort).toBeNull();
    expect(val(child(first, 'NegativeEventValue'))).toBe(
      `${getAttribute('deepDischargeEvents')?.name.en}: 0`,
    );
    expect(val(child(events?.value?.[1], 'NegativeEventValue'))).toBe(
      `${getAttribute('overchargeEvents')?.name.en}: 1`,
    );
    expect(val(child(first, 'LastUpdate'))).toBe('2026-08-31T06:00:00Z');
  });

  it('lists accident documents by uri', () => {
    const docs = root('InformationOnAccidents') as SML | undefined;
    expect(docs?.value?.map((p) => val(p))).toEqual([
      'https://passport.musterwerk.example/docs/ACC-MW-EV-2026-000123-01.pdf',
    ]);
  });

  it('folds the five temperature attributes into one block with the latest timestamp', () => {
    const t = root('TemperatureInformation');
    expect((t as SMC | undefined)?.value?.map((e) => e.idShort)).toEqual([
      'MeasuredTemp',
      'TimeExtremeHighTemp',
      'TimeExtremeLowTemp',
      'TimeExtremeHighTempCharging',
      'TimeExtremeLowTempCharging',
      'LastUpdate',
    ]);
    expect(val(child(t, 'MeasuredTemp'))).toBe('23.5');
    expect(val(child(t, 'TimeExtremeLowTemp'))).toBe('3');
    expect(val(child(t, 'LastUpdate'))).toBe('2026-08-31T06:00:00Z');
  });

  it('maps remaining power capability to the dynamic block plus LastUpdate', () => {
    const rpc = root('RemainingPowerCapability');
    const dyn = child(rpc, 'RemainingPowerCapabilityDynamicAt');
    expect(val(child(dyn, 'RPCLastUpdated'))).toBe('2026-09-02T21:45:00Z');
    expect(val(child(dyn, 'AtSoC'))).toBe('80');
    expect(val(child(dyn, 'PowerCapabilityAt'))).toBe('98');
    expect(val(child(rpc, 'LastUpdate'))).toBe('2026-09-02T21:45:00Z');
  });

  it('emits the structural InformationOnAccidents list even without documents, falls back to createdAt without recordedAt, and omits absent blocks', () => {
    const draft = PassportDraft.parse({
      ...samples['ev-valid'],
      attributes: { numberOfFullCycles: { value: '3.0', status: 'present' } },
    });
    const out = emitProductCondition(draft, resolveIds(draft));
    expect(out?.submodelElements?.map((e) => e.idShort)).toEqual([
      'NumberOfFullCycles',
      'InformationOnAccidents',
    ]);
    const cycles = out?.submodelElements?.[0];
    expect(val(child(cycles, 'NumberOfFullCyclesValue'))).toBe('3');
    expect(val(child(cycles, 'LastUpdate'))).toBe(draft.meta.createdAt);
    expect((out?.submodelElements?.[1] as SML | undefined)?.value).toBeNull();
  });

  it('is absent when the draft has no condition data', () => {
    const draft = PassportDraft.parse({
      ...samples['ev-valid'],
      attributes: { ratedCapacity: { value: '195', status: 'present' } },
    });
    expect(emitProductCondition(draft, resolveIds(draft))).toBeNull();
  });
});
