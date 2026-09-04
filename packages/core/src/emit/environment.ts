import * as aas from '@aas-core-works/aas-core3.0-typescript';
import type { PassportDraft } from '../model/passport.js';
import { type EmitOptions, resolveIds } from './ids.js';
import { emitCarbonFootprint } from './submodels/carbonFootprint.js';
import { emitCircularity } from './submodels/circularity.js';
import { emitHandoverDocumentation } from './submodels/handoverDocumentation.js';
import { emitMaterialComposition } from './submodels/materialComposition.js';
import { emitNameplate } from './submodels/nameplate.js';
import { emitProductCondition } from './submodels/productCondition.js';
import { emitTechnicalData } from './submodels/technicalData.js';

const { types, jsonization } = aas;

/** One shell + every submodel that has data, in template part order (1, 2, 3, 4, 5, 6, 7). */
export function buildEnvironment(
  draft: PassportDraft,
  options: EmitOptions = {},
): aas.types.Environment {
  const ids = resolveIds(draft, options);
  const submodels = [
    emitNameplate(draft, ids),
    emitHandoverDocumentation(draft, ids),
    emitCarbonFootprint(draft, ids),
    emitTechnicalData(draft, ids),
    emitProductCondition(draft, ids),
    emitMaterialComposition(draft, ids),
    emitCircularity(draft, ids),
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
