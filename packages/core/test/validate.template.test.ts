import {
  buildEnvironment,
  environmentToJsonable,
  PassportDraft,
  samples,
  validateTemplate,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

interface El {
  idShort?: string;
  modelType: string;
  semanticId?: { keys: { value: string }[] };
  valueType?: string;
  value?: El[] | string;
  typeValueListElement?: string;
}
interface Env {
  submodels: {
    idShort: string;
    semanticId?: { keys: { value: string }[] };
    submodelElements: El[];
  }[];
}

const base = () =>
  structuredClone(
    environmentToJsonable(buildEnvironment(PassportDraft.parse(samples['ev-valid']))),
  ) as unknown as Env;
const ids = (env: unknown) => validateTemplate(env).findings.map((f) => f.ruleId);
const submodel = (env: Env, idShort: string) => {
  const sm = env.submodels.find((s) => s.idShort === idShort);
  if (!sm) throw new Error(`no submodel ${idShort}`);
  return sm;
};
const element = (sm: { submodelElements: El[] }, idShort: string) => {
  const el = sm.submodelElements.find((e) => e.idShort === idShort);
  if (!el) throw new Error(`no element ${idShort}`);
  return el;
};

describe('L3 validateTemplate', () => {
  it('accepts the emitted environment for every valid sample', () => {
    for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const) {
      const env = environmentToJsonable(buildEnvironment(PassportDraft.parse(samples[name])));
      expect(validateTemplate(env).findings, name).toEqual([]);
    }
  });
  it('PW-L3-MISSING when a mandatory element is removed', () => {
    const env = base();
    const sm = submodel(env, 'BatteryNameplate');
    sm.submodelElements = sm.submodelElements.filter((e) => e.idShort !== 'SerialNumber');
    const f = validateTemplate(env).findings;
    expect(f.map((x) => x.ruleId)).toEqual(['PW-L3-MISSING']);
    expect(f[0]?.templatePath).toBe('1/SerialNumber');
    expect(f[0]?.severity).toBe('error');
  });
  it('PW-L3-MISSING inside a list child (material without identifier)', () => {
    const env = base();
    const mats = element(submodel(env, 'MaterialComposition'), 'BatteryMaterials');
    const first = (mats.value as El[])[0];
    if (!first) throw new Error('no material');
    first.value = (first.value as El[]).filter((e) => e.idShort !== 'BatteryMaterialIdentifier');
    const f = validateTemplate(env).findings;
    expect(f.map((x) => x.ruleId)).toEqual(['PW-L3-MISSING']);
    expect(f[0]?.templatePath).toBe('6/BatteryMaterials/BatteryMaterial/BatteryMaterialIdentifier');
    expect(f[0]?.path).toBe('MaterialComposition/BatteryMaterials[0]');
  });
  it('PW-L3-SEMANTIC-ID when a semanticId is changed', () => {
    const env = base();
    element(submodel(env, 'BatteryNameplate'), 'SerialNumber').semanticId = {
      keys: [{ value: 'urn:wrong' }],
    };
    expect(ids(env)).toEqual(['PW-L3-SEMANTIC-ID']);
  });
  it('PW-L3-VALUE-TYPE when a valueType is changed', () => {
    const env = base();
    element(submodel(env, 'BatteryNameplate'), 'DateOfManufacture').valueType = 'xs:string';
    expect(ids(env)).toEqual(['PW-L3-VALUE-TYPE']);
  });
  it('PW-L3-MODEL-TYPE when the model type differs', () => {
    const env = base();
    const el = element(submodel(env, 'BatteryNameplate'), 'SerialNumber');
    el.modelType = 'MultiLanguageProperty';
    delete el.valueType;
    el.value = [];
    expect(ids(env)).toContain('PW-L3-MODEL-TYPE');
  });
  it('PW-L3-TOO-MANY when a One element is duplicated', () => {
    const env = base();
    const sm = submodel(env, 'BatteryNameplate');
    sm.submodelElements.push(structuredClone(element(sm, 'SerialNumber')));
    expect(ids(env)).toEqual(['PW-L3-TOO-MANY']);
  });
  it('PW-L3-UNKNOWN-ELEMENT (warning) for a stray element, but not inside drop-ins', () => {
    const env = base();
    submodel(env, 'BatteryNameplate').submodelElements.push({
      idShort: 'Stray',
      modelType: 'Property',
      valueType: 'xs:string',
      value: 'x',
    });
    const f = validateTemplate(env).findings;
    expect(f.map((x) => `${x.ruleId}:${x.severity}`)).toEqual(['PW-L3-UNKNOWN-ELEMENT:warning']);
    // AddressInformation children (Street, ...) are not in the template and must not warn:
    expect(f.some((x) => x.path.includes('AddressInformation'))).toBe(false);
  });
  it('PW-L3-UNKNOWN-SUBMODEL and PW-L3-SUBMODEL-ID-SHORT', () => {
    const env = base();
    submodel(env, 'BatteryNameplate').idShort = 'Nameplate';
    expect(ids(env)).toEqual(['PW-L3-SUBMODEL-ID-SHORT']);
    const env2 = base();
    submodel(env2, 'BatteryNameplate').semanticId = { keys: [{ value: 'urn:unknown' }] };
    expect(ids(env2)).toEqual(['PW-L3-UNKNOWN-SUBMODEL']);
  });
});
