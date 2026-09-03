import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { getTemplate } from '@passwerk/rules';
import { getField, type PassportDraft } from '../../model/passport.js';

const { types, jsonization } = aas;

interface RawSubmodel {
  idShort?: string;
  semanticId?: unknown;
  supplementalSemanticIds?: unknown[];
  administration?: { version?: string; revision?: string; templateId?: string };
}

/** Instance submodel whose header (idShort, semanticIds, administration) is copied from the template. */
export function submodelFromTemplate(
  part: number,
  id: string,
  elements: aas.types.ISubmodelElement[],
): aas.types.Submodel {
  const template = getTemplate(part);
  if (!template) throw new Error(`@passwerk/core: no bundled template for part ${part}`);
  const raw = template.environment.submodels?.[0] as RawSubmodel | undefined;
  if (!raw) throw new Error(`@passwerk/core: template ${part} has no submodel`);

  const ref = (j: unknown) =>
    jsonization.referenceFromJsonable(j as aas.jsonization.JsonValue).mustValue();
  const sm = new types.Submodel(id);
  sm.idShort = raw.idShort ?? template.submodelIdShort;
  sm.kind = types.ModellingKind.Instance;
  sm.semanticId = raw.semanticId ? ref(raw.semanticId) : null;
  sm.supplementalSemanticIds = raw.supplementalSemanticIds?.length
    ? raw.supplementalSemanticIds.map(ref)
    : null;
  sm.administration = new types.AdministrativeInformation(
    null,
    raw.administration?.version ?? null,
    raw.administration?.revision ?? null,
    null,
    raw.administration?.templateId ?? null,
  );
  sm.submodelElements = elements.length > 0 ? elements : null;
  return sm;
}

/** True when at least one of the ids has a usable (present or conflict) value. */
export function hasAny(draft: PassportDraft, ids: readonly string[]): boolean {
  return ids.some((id) => {
    const f = getField(draft, id);
    return f?.value !== undefined && (f.status === 'present' || f.status === 'conflict');
  });
}

/** Push `el` when defined; keeps emitter code linear. */
export function push<T>(into: T[], el: T | null | undefined): void {
  if (el !== null && el !== undefined) into.push(el);
}
