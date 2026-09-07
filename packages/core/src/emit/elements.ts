import { type CatalogueElement, getTemplateElement } from '@passwerk/rules';
import * as aas from '../vendor/aasCore.js';

const { types, stringification } = aas;

function element(path: string): CatalogueElement {
  const el = getTemplateElement(path);
  if (!el) throw new Error(`@passwerk/core: unknown template path ${path}`);
  return el;
}

export function externalReference(value: string): aas.types.Reference {
  return new types.Reference(types.ReferenceTypes.ExternalReference, [
    new types.Key(types.KeyTypes.GlobalReference, value),
  ]);
}

/** Direct children of a SubmodelElementList must not carry an idShort (AASd-120). */
export function isListChild(path: string): boolean {
  const cut = path.lastIndexOf('/');
  if (cut < 0) return false;
  return getTemplateElement(path.slice(0, cut))?.modelType === 'SubmodelElementList';
}

function xsd(valueType: string | null, path: string): aas.types.DataTypeDefXsd {
  const v = valueType ? stringification.dataTypeDefXsdFromString(valueType) : null;
  if (v === null) {
    throw new Error(`@passwerk/core: template ${path} has no usable valueType (${valueType})`);
  }
  return v;
}

function applySemantics(target: aas.types.ISubmodelElement, el: CatalogueElement): void {
  target.idShort = isListChild(el.path) ? null : el.idShort;
  target.semanticId = el.semanticId ? externalReference(el.semanticId) : null;
  target.supplementalSemanticIds =
    el.supplementalSemanticIds.length > 0
      ? el.supplementalSemanticIds.map(externalReference)
      : null;
}

export function property(path: string, value: string): aas.types.Property {
  const el = element(path);
  const p = new types.Property(xsd(el.valueType, path));
  applySemantics(p, el);
  p.value = value;
  return p;
}

export function multiLanguageProperty(
  path: string,
  value: Record<string, string>,
): aas.types.MultiLanguageProperty {
  const el = element(path);
  const m = new types.MultiLanguageProperty();
  applySemantics(m, el);
  m.value = Object.keys(value)
    .sort()
    .map((lang) => new types.LangStringTextType(lang, value[lang] as string));
  return m;
}

export function collection(
  path: string,
  children: aas.types.ISubmodelElement[],
): aas.types.SubmodelElementCollection {
  const el = element(path);
  const c = new types.SubmodelElementCollection();
  applySemantics(c, el);
  c.value = children.length > 0 ? children : null;
  return c;
}

export function list(
  path: string,
  children: aas.types.ISubmodelElement[],
): aas.types.SubmodelElementList {
  const el = element(path);
  const le = el.listElement;
  const typeValue = le?.typeValueListElement
    ? stringification.aasSubmodelElementsFromString(le.typeValueListElement)
    : null;
  if (typeValue === null) {
    throw new Error(`@passwerk/core: template ${path} has no typeValueListElement`);
  }
  const l = new types.SubmodelElementList(typeValue);
  applySemantics(l, el);
  l.valueTypeListElement = le?.valueTypeListElement ? xsd(le.valueTypeListElement, path) : null;
  l.semanticIdListElement = le?.semanticIdListElement
    ? externalReference(le.semanticIdListElement)
    : null;
  l.value = children.length > 0 ? children : null;
  return l;
}

export function file(path: string, contentType: string, value: string): aas.types.File {
  const el = element(path);
  const f = new types.File(contentType);
  applySemantics(f, el);
  f.value = value;
  return f;
}

/**
 * A Property with idShort only. Used solely for children of drop-in collections whose
 * template (ZVEI Contact Information) is not bundled, so no semanticId is available.
 * verify: pin IDTA 02002 Contact Information to replace this (spec section 3.4).
 */
export function plainProperty(idShort: string, value: string): aas.types.Property {
  const p = new types.Property(types.DataTypeDefXsd.String);
  p.idShort = idShort;
  p.value = value;
  return p;
}
