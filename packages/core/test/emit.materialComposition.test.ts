import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { emitMaterialComposition, PassportDraft, resolveIds, samples } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const draft = PassportDraft.parse(samples['ev-valid']);
const sm = emitMaterialComposition(draft, resolveIds(draft));
const top = (idShort: string) => sm?.submodelElements?.find((e) => e.idShort === idShort);
const child = (c: aas.types.ISubmodelElement | undefined, idShort: string) =>
  (c as aas.types.SubmodelElementCollection | undefined)?.value?.find((e) => e.idShort === idShort);
const val = (c: aas.types.ISubmodelElement | undefined) =>
  (c as aas.types.Property | undefined)?.value;
const listOf = (e: aas.types.ISubmodelElement | undefined) =>
  (e as aas.types.SubmodelElementList | undefined)?.value ?? [];

function withAttributes(overrides: Record<string, unknown>): PassportDraft {
  return PassportDraft.parse({
    ...samples['ev-valid'],
    attributes: { ...samples['ev-valid'].attributes, ...overrides },
  });
}

describe('emitMaterialComposition', () => {
  it('emits the chemistry collection', () => {
    const chem = top('BatteryChemistry');
    expect(val(child(chem, 'ShortName'))).toBe('NMC');
    expect(val(child(chem, 'ClearName'))).toBe('Lithium nickel manganese cobalt oxide');
  });
  it('merges critical raw materials and electrode materials into BatteryMaterials', () => {
    const mats = listOf(top('BatteryMaterials'));
    expect(mats.length).toBe(5);
    expect(mats.every((m) => m.idShort === null)).toBe(true);
    expect(val(child(mats[0], 'BatteryMaterialIdentifier'))).toBe('7439-93-2');
    expect(val(child(mats[0], 'BatteryMaterialMass'))).toBe('6.40');
    expect(val(child(mats[0], 'IsCriticalRawMaterial'))).toBe('true');
    expect(val(child(mats[3], 'IsCriticalRawMaterial'))).toBe('false');
    expect(child(mats[3], 'BatteryMaterialMass')).toBeUndefined();
    const loc = child(mats[0], 'BatteryMaterialLocation');
    expect(val(child(loc, 'ComponentName'))).toBe('Cathode');
    expect((mats[0] as aas.types.SubmodelElementCollection).value?.map((e) => e.idShort)).toEqual([
      'BatteryMaterialLocation',
      'BatteryMaterialIdentifier',
      'BatteryMaterialName',
      'BatteryMaterialMass',
      'IsCriticalRawMaterial',
    ]);
  });
  it('emits hazardous substances with impacts as a nested list', () => {
    const subs = listOf(top('HazardousSubstances'));
    expect(subs.length).toBe(1);
    expect(val(child(subs[0], 'HazardousSubstanceClass'))).toBe('AcuteToxicity');
    expect(val(child(subs[0], 'HazardousSubstanceConcentration'))).toBe('1.2');
    const impacts = listOf(child(subs[0], 'HazardousSubstanceImpact'));
    expect(impacts.map((p) => val(p))).toEqual([
      'H301 Toxic if swallowed',
      'H314 Causes severe skin burns and eye damage',
    ]);
    expect(impacts[0]?.idShort).toBeNull();
  });
  it('attaches a flat substanceImpacts text to every substance that has none', () => {
    const d = withAttributes({
      hazardousSubstances: {
        value: [{ name: 'LiPF6', identifier: '21324-40-3' }],
        status: 'present',
      },
      substanceImpacts: { value: 'H302 Harmful if swallowed', status: 'present' },
    });
    const s = emitMaterialComposition(d, resolveIds(d));
    const subs = listOf(s?.submodelElements?.find((e) => e.idShort === 'HazardousSubstances'));
    const impacts = listOf(child(subs[0], 'HazardousSubstanceImpact'));
    expect(val(impacts[0])).toBe('H302 Harmful if swallowed');
  });
  it('skips the identifier element when a material has none (broken sample)', () => {
    const d = withAttributes({
      criticalRawMaterials: { value: [{ name: 'Lithium' }], status: 'present' },
    });
    const s = emitMaterialComposition(d, resolveIds(d));
    const mats = listOf(s?.submodelElements?.find((e) => e.idShort === 'BatteryMaterials'));
    expect(child(mats[0], 'BatteryMaterialIdentifier')).toBeUndefined();
  });
});
