import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { emitCircularity, PassportDraft, resolveIds, samples } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

type SMC = aas.types.SubmodelElementCollection;
type SML = aas.types.SubmodelElementList;
type MLP = aas.types.MultiLanguageProperty;

const ev = PassportDraft.parse(samples['ev-valid']);
const sm = emitCircularity(ev, resolveIds(ev));
const root = (idShort: string) => sm?.submodelElements?.find((e) => e.idShort === idShort);
const child = (parent: aas.types.ISubmodelElement | undefined, idShort: string) =>
  (parent as SMC | undefined)?.value?.find((e) => e.idShort === idShort);
const val = (e: aas.types.ISubmodelElement | undefined) =>
  (e as aas.types.Property | undefined)?.value;
const listValues = (e: aas.types.ISubmodelElement | undefined) =>
  (e as SML | undefined)?.value?.map((p) => val(p));
const mlp = (e: aas.types.ISubmodelElement | undefined) =>
  Object.fromEntries((e as MLP | undefined)?.value?.map((l) => [l.language, l.text]) ?? []);

describe('emitCircularity', () => {
  it('emits the root elements in catalogue order', () => {
    expect(sm?.idShort).toBe('Circularity');
    expect(sm?.submodelElements?.map((e) => e.idShort)).toEqual([
      'DismantlingAndRemovalInformation',
      'SparePartSources',
      'RecycledContentInformation',
      'SafetyMeasures',
      'EndOfLifeInformation',
      'RenewableContent',
    ]);
  });

  it('lists dismantling documents by uri', () => {
    expect(listValues(root('DismantlingAndRemovalInformation'))).toEqual([
      'https://passport.musterwerk.example/docs/DISM-MW-EV-2026.pdf',
    ]);
  });

  it('maps spare part suppliers with multilingual name and address, contact and components', () => {
    const suppliers = root('SparePartSources') as SML | undefined;
    expect(suppliers?.value?.length).toBe(2);
    const first = suppliers?.value?.[0] as SMC | undefined;
    expect(first?.idShort).toBeNull();
    expect(first?.value?.map((e) => e.idShort)).toEqual([
      'NameOfSupplier',
      'AddressOfSupplier',
      'EmailAddressOfSupplier',
      'SupplierWebAddress',
      'Components',
    ]);
    expect(mlp(child(first, 'NameOfSupplier'))).toEqual({
      de: 'Musterwerk Ersatzteile GmbH',
      en: 'Musterwerk Spare Parts GmbH',
    });
    const address = child(first, 'AddressOfSupplier');
    expect(mlp(child(address, 'NationalCode'))).toEqual({ de: 'DE' });
    expect(mlp(child(address, 'PostalCode'))).toEqual({ de: '28199' });
    expect(mlp(child(address, 'Street'))).toEqual({ de: 'Werkstrasse 2' });
    expect(val(child(child(first, 'EmailAddressOfSupplier'), 'EmailAddress'))).toBe(
      'ersatzteile@musterwerk.example',
    );
    expect(val(child(first, 'SupplierWebAddress'))).toBe('https://ersatzteile.musterwerk.example');
    const comps = child(first, 'Components') as SML | undefined;
    expect(comps?.value?.length).toBe(2);
    const comp = comps?.value?.[0] as SMC | undefined;
    expect(comp?.idShort).toBeNull();
    expect(val(child(comp, 'PartName'))).toBe('Battery module');
    expect(val(child(comp, 'PartNumber'))).toBe('MW-MOD-48-A');
  });

  it('falls back to componentPartNumbers for suppliers without their own components', () => {
    const suppliers = root('SparePartSources') as SML | undefined;
    const second = suppliers?.value?.[1] as SMC | undefined;
    expect(second?.value?.map((e) => e.idShort)).toEqual([
      'NameOfSupplier',
      'AddressOfSupplier',
      'EmailAddressOfSupplier',
      'SupplierWebAddress',
      'Components',
    ]);
    expect(mlp(child(child(second, 'AddressOfSupplier'), 'Street'))).toEqual({
      en: 'Hafenstrasse 9',
    });
    const comps = child(second, 'Components') as SML | undefined;
    expect(comps?.value?.map((c) => val(child(c, 'PartNumber')))).toEqual(['MW-BMS-7']);
  });

  it('folds the eight recycled shares into four materials', () => {
    const rc = root('RecycledContentInformation') as SML | undefined;
    const entries = rc?.value?.map((e) => ({
      material: val(child(e, 'RecycledMaterial')),
      pre: val(child(e, 'PreConsumerShare')),
      post: val(child(e, 'PostConsumerShare')),
      order: (e as SMC).value?.map((c) => c.idShort),
    }));
    expect(entries).toEqual([
      {
        material: 'Cobalt',
        pre: '16',
        post: '4',
        order: ['PreConsumerShare', 'RecycledMaterial', 'PostConsumerShare'],
      },
      {
        material: 'Lithium',
        pre: '6',
        post: '2',
        order: ['PreConsumerShare', 'RecycledMaterial', 'PostConsumerShare'],
      },
      {
        material: 'Nickel',
        pre: '6',
        post: '3',
        order: ['PreConsumerShare', 'RecycledMaterial', 'PostConsumerShare'],
      },
      {
        material: 'Lead',
        pre: '85',
        post: '10',
        order: ['PreConsumerShare', 'RecycledMaterial', 'PostConsumerShare'],
      },
    ]);
  });

  it('emits only the materials with a present share', () => {
    const draft = PassportDraft.parse({
      ...samples['ev-valid'],
      attributes: { recycledNickelPostConsumer: { value: '3', status: 'present' } },
    });
    const out = emitCircularity(draft, resolveIds(draft));
    const rc = out?.submodelElements?.find((e) => e.idShort === 'RecycledContentInformation') as
      | SML
      | undefined;
    expect(rc?.value?.length).toBe(1);
    const only = rc?.value?.[0] as SMC | undefined;
    expect(only?.value?.map((c) => c.idShort)).toEqual(['RecycledMaterial', 'PostConsumerShare']);
    expect(val(child(only, 'RecycledMaterial'))).toBe('Nickel');
    // the structural SparePartSources list is still there, empty
    expect(out?.submodelElements?.map((e) => e.idShort)).toEqual([
      'SparePartSources',
      'RecycledContentInformation',
    ]);
  });

  it('maps safety measures, end-of-life documents and renewable content', () => {
    const safety = root('SafetyMeasures');
    expect(listValues(child(safety, 'SafetyInstructions'))).toEqual([
      'https://passport.musterwerk.example/docs/SAFETY-MW-EV-2026.pdf',
    ]);
    expect(listValues(child(safety, 'ExtinguishingAgents'))).toEqual(['water in large quantities']);
    const eol = root('EndOfLifeInformation');
    expect((eol as SMC | undefined)?.value?.map((e) => e.idShort)).toEqual([
      'WastePrevention',
      'SeparateCollection',
      'InformationOnCollection',
    ]);
    expect(listValues(child(eol, 'InformationOnCollection'))).toEqual([
      'https://passport.musterwerk.example/docs/EOL-COLLECTION-MW-EV-2026.pdf',
    ]);
    expect(val(root('RenewableContent'))).toBe('0');
  });

  it('is absent when the draft has no circularity data', () => {
    const draft = PassportDraft.parse({
      ...samples['ev-valid'],
      attributes: { ratedCapacity: { value: '195', status: 'present' } },
    });
    expect(emitCircularity(draft, resolveIds(draft))).toBeNull();
  });
});
