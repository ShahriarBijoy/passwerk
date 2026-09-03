import * as aas from '@aas-core-works/aas-core3.0-typescript';
import type { PassportDraft } from '../model/passport.js';
import { type EmitOptions, resolveIds } from './ids.js';
import { emitCarbonFootprint } from './submodels/carbonFootprint.js';
import { emitMaterialComposition } from './submodels/materialComposition.js';
import { emitNameplate } from './submodels/nameplate.js';

const { types, jsonization } = aas;

/** One shell + the MVP submodels that have data, in template part order (1, 3, 6). */
export function buildEnvironment(
  draft: PassportDraft,
  options: EmitOptions = {},
): aas.types.Environment {
  const ids = resolveIds(draft, options);
  const submodels = [
    emitNameplate(draft, ids),
    emitCarbonFootprint(draft, ids),
    emitMaterialComposition(draft, ids),
  ].filter((s): s is aas.types.Submodel => s !== null);

  const shell = new types.AssetAdministrationShell(
    ids.shellId,
    new types.AssetInformation(types.AssetKind.Instance, ids.assetId),
  );
  shell.idShort = 'BatteryPassport';
  shell.submodels =
    submodels.length > 0
      ? submodels.map(
          (s) =>
            new types.Reference(types.ReferenceTypes.ModelReference, [
              new types.Key(types.KeyTypes.Submodel, s.id),
            ]),
        )
      : null;

  return new types.Environment([shell], submodels.length > 0 ? submodels : null, null);
}

export function environmentToJsonable(env: aas.types.Environment): aas.jsonization.JsonObject {
  return jsonization.toJsonable(env);
}
