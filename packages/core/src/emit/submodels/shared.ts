import { getTemplate } from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import { getField, type PassportDraft, presentValue } from '../../model/passport.js';
import { isDecimalString } from '../../model/values.js';
import * as aas from '../../vendor/aasCore.js';
import { list, property } from '../elements.js';

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

/**
 * Integer lexical form for template properties typed xs:integer / xs:unsignedInt: "95.0"
 * becomes "95". Anything that is not a whole decimal passes through unchanged, so a fractional
 * value fails L2 honestly instead of being rounded.
 */
export function integral(value: string): string {
  if (!isDecimalString(value)) return value;
  const d = new Decimal(value);
  return d.isInteger() ? d.toFixed(0) : value;
}

/** The moment a value was recorded: Field.recordedAt, else the draft's createdAt (ADR D-015). */
export function timestamp(draft: PassportDraft, id: string): string {
  return getField(draft, id)?.recordedAt ?? draft.meta.createdAt;
}

/** A SubmodelElementList of DocumentIdentifier properties (uri preferred over id). */
export function documentIds(
  path: string,
  docs: readonly { id: string; uri?: string }[],
): aas.types.SubmodelElementList {
  return list(
    path,
    docs.map((d) => property(`${path}/DocumentIdentifier`, d.uri ?? d.id)),
  );
}

/** Category strings documented by the IDTA 02035-4 template ("lmt", "ev", "industrial", "stationary"). */
const TEMPLATE_CATEGORY: Record<string, string> = {
  EV: 'ev',
  LMT: 'lmt',
  INDUSTRIAL_GT_2KWH: 'industrial',
  INDUSTRIAL: 'industrial',
  STATIONARY: 'stationary',
};

/** The batteryCategory attribute when present, else meta.category, in the template's spelling. */
export function templateCategory(draft: PassportDraft): string {
  const raw = presentValue<string>(draft, 'batteryCategory') ?? draft.meta.category;
  return TEMPLATE_CATEGORY[raw.toUpperCase()] ?? raw;
}
