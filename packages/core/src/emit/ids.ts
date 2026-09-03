import type { PassportDraft } from '../model/passport.js';

export interface EmitIds {
  shellId: string;
  assetId: string;
  submodelId: (idShort: string) => string;
}

export interface EmitOptions {
  ids?: Partial<{ shellId: string; assetId: string; submodelIdPrefix: string }>;
}

/** ADR D-010: ids derive from the passport identifier unless overridden. */
export function resolveIds(draft: PassportDraft, options: EmitOptions = {}): EmitIds {
  const base = draft.meta.passportId;
  const prefix = options.ids?.submodelIdPrefix ?? `${base}/submodels`;
  return {
    shellId: options.ids?.shellId ?? `${base}/aas`,
    assetId: options.ids?.assetId ?? base,
    submodelId: (idShort) => `${prefix}/${idShort}`,
  };
}
