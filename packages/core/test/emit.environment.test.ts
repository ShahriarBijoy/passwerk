import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { buildEnvironment, PassportDraft, samples } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('buildEnvironment', () => {
  it('has one shell referencing every emitted submodel', () => {
    const env = buildEnvironment(PassportDraft.parse(samples['ev-valid']));
    expect(env.assetAdministrationShells?.length).toBe(1);
    const shell = env.assetAdministrationShells?.[0];
    expect(shell?.id).toBe('https://passport.musterwerk.example/battery/MW-EV-2026-000123/aas');
    expect(shell?.assetInformation.assetKind).toBe(aas.types.AssetKind.Instance);
    expect(shell?.assetInformation.globalAssetId).toBe(
      'https://passport.musterwerk.example/battery/MW-EV-2026-000123',
    );
    expect(env.submodels?.map((s) => s.idShort)).toEqual([
      'BatteryNameplate',
      'CarbonFootprint',
      'MaterialComposition',
    ]);
    expect(shell?.submodels?.map((r) => r.keys[0]?.value)).toEqual(env.submodels?.map((s) => s.id));
    expect(shell?.submodels?.[0]?.type).toBe(aas.types.ReferenceTypes.ModelReference);
    expect(shell?.submodels?.[0]?.keys[0]?.type).toBe(aas.types.KeyTypes.Submodel);
  });
  it('omits submodels without data', () => {
    const env = buildEnvironment(PassportDraft.parse(samples['lmt-valid']));
    expect(env.submodels?.map((s) => s.idShort)).toEqual([
      'BatteryNameplate',
      'MaterialComposition',
    ]);
  });
  it('passes aas-core verification for every valid sample', () => {
    for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const) {
      const env = buildEnvironment(PassportDraft.parse(samples[name]));
      const errors = [...aas.verification.verify(env)].map((e) => `${e.path}: ${e.message}`);
      expect(errors, name).toEqual([]);
    }
  });
});
