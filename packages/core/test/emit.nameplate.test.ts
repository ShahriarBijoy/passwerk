import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { emitNameplate, PassportDraft, resolveIds, samples } from '@passwerk/core';
import { getTemplate } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const draft = PassportDraft.parse(samples['ev-valid']);
const sm = emitNameplate(draft, resolveIds(draft));
const byIdShort = (idShort: string) => sm?.submodelElements?.find((e) => e.idShort === idShort);
const val = (e: aas.types.ISubmodelElement | undefined) =>
  (e as aas.types.Property | undefined)?.value;

describe('emitNameplate', () => {
  it('copies the submodel header from the template and sets kind Instance', () => {
    const t = getTemplate(1);
    expect(sm?.idShort).toBe(t?.submodelIdShort);
    expect(sm?.semanticId?.keys[0]?.value).toBe(t?.submodelSemanticId);
    expect(sm?.kind).toBe(aas.types.ModellingKind.Instance);
    expect(sm?.administration?.templateId).toBe('https://admin-shell.io/idta-02035-1');
    expect(sm?.id).toBe(
      'https://passport.musterwerk.example/battery/MW-EV-2026-000123/submodels/BatteryNameplate',
    );
  });
  it('maps scalar attributes to their template elements', () => {
    expect(val(byIdShort('URIOfTheProduct'))).toBe(draft.meta.passportId);
    expect(val(byIdShort('SerialNumber'))).toBe('MW-EV-2026-000123');
    expect(val(byIdShort('DateOfManufacture'))).toBe('2026-03-01');
    expect(val(byIdShort('LifeCycleStage'))).toBe('Original');
    expect(val(byIdShort('ManufacturerIdentifier'))).toBe('DE-MW-0001');
    expect(val(byIdShort('UniqueFacilityIdentifier'))).toBe('DE-MW-0001-PLANT-BRE');
    expect(byIdShort('OperatorIdentifier')).toBeUndefined();
  });
  it('emits ManufacturerName as MLP and the address as a drop-in collection', () => {
    const name = byIdShort('ManufacturerName') as aas.types.MultiLanguageProperty;
    expect(name.value?.map((l) => l.language)).toEqual(['de', 'en']);
    const addr = byIdShort('AddressInformation') as aas.types.SubmodelElementCollection;
    expect(addr.value?.map((e) => e.idShort)).toEqual([
      'Street',
      'Zipcode',
      'CityTown',
      'NationalCode',
      'Email',
    ]);
    expect(addr.value?.[0]?.semanticId).toBeNull();
  });
  it('emits one marking per marking attribute, list children without idShort', () => {
    const markings = byIdShort('Markings') as aas.types.SubmodelElementList;
    expect(markings.value?.length).toBe(2);
    const first = markings.value?.[0] as aas.types.SubmodelElementCollection;
    expect(first.idShort).toBeNull();
    const names = markings.value?.map((m) =>
      val(
        (m as aas.types.SubmodelElementCollection).value?.find((e) => e.idShort === 'MarkingName'),
      ),
    );
    expect(names).toEqual(['Separate collection symbol', 'Meaning of labels and symbols']);
    const fileEl = first.value?.find((e) => e.idShort === 'MarkingFile') as aas.types.File;
    expect(fileEl.value).toBe('https://passport.musterwerk.example/files/separate-collection.png');
  });
  it('emits document lists as Property children without idShort', () => {
    const doc = byIdShort('EUDeclarationOfConformity') as aas.types.SubmodelElementList;
    expect(val(doc.value?.[0])).toBe('DoC-MW-EV-2026-01');
    expect(doc.value?.[0]?.idShort).toBeNull();
  });
  it('returns null when no nameplate attribute is present', () => {
    const empty = PassportDraft.parse({ meta: draft.meta, attributes: {} });
    expect(emitNameplate(empty, resolveIds(empty))).toBeNull();
  });
  it('keeps element order as in the catalogue', () => {
    expect(sm?.submodelElements?.map((e) => e.idShort)).toEqual([
      'URIOfTheProduct',
      'ManufacturerName',
      'AddressInformation',
      'SerialNumber',
      'DateOfManufacture',
      'UniqueFacilityIdentifier',
      'LifeCycleStage',
      'ManufacturerIdentifier',
      'Markings',
      'EUDeclarationOfConformity',
      'ResultsOfTestReportsProvingCompliance',
    ]);
  });
});
