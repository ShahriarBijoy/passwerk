import * as aas from '@aas-core-works/aas-core3.0-typescript';
import {
  collection,
  file,
  isListChild,
  list,
  multiLanguageProperty,
  type PassportDraft,
  property,
  resolveIds,
} from '@passwerk/core';
import { getTemplateElement } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('element builders read everything from the catalogue', () => {
  it('property copies idShort, semanticId, supplemental ids and valueType', () => {
    const p = property('1/SerialNumber', 'A12');
    const t = getTemplateElement('1/SerialNumber');
    expect(p.idShort).toBe('SerialNumber');
    expect(p.semanticId?.keys[0]?.value).toBe(t?.semanticId);
    expect(p.supplementalSemanticIds?.map((r) => r.keys[0]?.value)).toEqual(
      t?.supplementalSemanticIds,
    );
    expect(aas.stringification.dataTypeDefXsdToString(p.valueType)).toBe('xs:string');
    expect(p.value).toBe('A12');
    expect(p.qualifiers).toBeNull();
  });
  it('list children carry no idShort (AASd-120)', () => {
    expect(isListChild('1/Markings/Markings__00__')).toBe(true);
    expect(isListChild('1/SerialNumber')).toBe(false);
    const c = collection('1/Markings/Markings__00__', [
      property('1/Markings/Markings__00__/MarkingName', 'x'),
    ]);
    expect(c.idShort).toBeNull();
    expect(c.value?.[0]?.idShort).toBe('MarkingName');
  });
  it('list copies typeValueListElement, valueTypeListElement and semanticIdListElement', () => {
    const l = list('3/ProductCarbonFootprints', []);
    expect(aas.stringification.aasSubmodelElementsToString(l.typeValueListElement)).toBe(
      'SubmodelElementCollection',
    );
    expect(l.semanticIdListElement?.keys[0]?.value).toBe(
      getTemplateElement('3/ProductCarbonFootprints')?.listElement?.semanticIdListElement,
    );
    const l2 = list('1/EUDeclarationOfConformity', []);
    expect(l2.valueTypeListElement).not.toBeNull();
    expect(
      aas.stringification.dataTypeDefXsdToString(
        l2.valueTypeListElement ?? aas.types.DataTypeDefXsd.AnyUri,
      ),
    ).toBe('xs:string');
    expect(l2.semanticIdListElement).toBeNull();
  });
  it('multiLanguageProperty and file', () => {
    const m = multiLanguageProperty('1/ManufacturerName', { en: 'Musterwerk', de: 'Musterwerk' });
    expect(m.value?.map((l) => `${l.language}=${l.text}`)).toEqual([
      'de=Musterwerk',
      'en=Musterwerk',
    ]);
    const f = file('1/Markings/Markings__00__/MarkingFile', 'image/png', 'x.png');
    expect(f.contentType).toBe('image/png');
    expect(f.value).toBe('x.png');
  });
  it('throws on an unknown catalogue path', () => {
    expect(() => property('1/DoesNotExist', 'x')).toThrow(/unknown template path/);
  });
});

describe('resolveIds', () => {
  const draft = {
    meta: {
      schemaVersion: '1.0',
      category: 'EV',
      createdAt: '2026-09-03T12:00:00Z',
      passportId: 'https://p.example/b/1',
    },
    attributes: {},
  } as PassportDraft;
  it('derives ids from the passport id', () => {
    const ids = resolveIds(draft);
    expect(ids.assetId).toBe('https://p.example/b/1');
    expect(ids.shellId).toBe('https://p.example/b/1/aas');
    expect(ids.submodelId('BatteryNameplate')).toBe(
      'https://p.example/b/1/submodels/BatteryNameplate',
    );
  });
  it('honours overrides', () => {
    const ids = resolveIds(draft, { ids: { shellId: 'urn:x:aas', submodelIdPrefix: 'urn:x:sm' } });
    expect(ids.shellId).toBe('urn:x:aas');
    expect(ids.submodelId('CarbonFootprint')).toBe('urn:x:sm/CarbonFootprint');
  });
});
