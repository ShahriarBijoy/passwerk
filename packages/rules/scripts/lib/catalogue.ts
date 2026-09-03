/**
 * Builds the template catalogue: a flat, deterministic index of every SubmodelElement in the
 * seven IDTA 02035 templates, joined with its ConceptDescription. Pure function, no I/O.
 *
 * Nothing here is invented: every semanticId, idShort, cardinality, value type, unit and
 * description is copied verbatim from the official template JSON. The only derived fields are
 * `path` (idShort chain), `cardinality.min/max` (parsed from the SMT qualifier) and
 * `dinChapter` (parsed from the description text where the template authors cite it).
 */

import type {
  Cardinality,
  CatalogueElement,
  CatalogueTemplate,
  ConceptInfo,
  TemplateCatalogue,
} from '../../src/types.ts';

export type { Cardinality, CatalogueElement, CatalogueTemplate, ConceptInfo, TemplateCatalogue };

export interface TemplateInput {
  /** IDTA part number 1..7 */
  part: number;
  /** Template version string as published, e.g. "1.0.1" */
  version: string;
  /** Parsed template.json (AAS V3.0 Environment) */
  environment: AasEnvironment;
}

// Minimal structural types for the parts of an AAS V3.0 JSON Environment we read.
interface LangString {
  language: string;
  text: string;
}
interface Key {
  type: string;
  value: string;
}
interface Reference {
  type: string;
  keys: Key[];
}
interface Qualifier {
  type: string;
  valueType?: string;
  value?: string;
}
export interface SubmodelElement {
  modelType: string;
  idShort?: string;
  semanticId?: Reference;
  supplementalSemanticIds?: Reference[];
  qualifiers?: Qualifier[];
  description?: LangString[];
  valueType?: string;
  value?: unknown;
  typeValueListElement?: string;
  valueTypeListElement?: string;
  semanticIdListElement?: Reference;
  orderRelevant?: boolean;
  contentType?: string;
}
interface Submodel {
  id: string;
  idShort?: string;
  kind?: string;
  semanticId?: Reference;
  administration?: { version?: string; revision?: string; templateId?: string };
  description?: LangString[];
  submodelElements?: SubmodelElement[];
}
interface DataSpecificationContent {
  modelType?: string;
  preferredName?: LangString[];
  shortName?: LangString[];
  unit?: string;
  unitId?: Reference;
  dataType?: string;
  definition?: LangString[];
  valueFormat?: string;
  symbol?: string;
}
interface ConceptDescription {
  id: string;
  idShort?: string;
  embeddedDataSpecifications?: { dataSpecificationContent?: DataSpecificationContent }[];
}
export interface AasEnvironment {
  assetAdministrationShells?: unknown[];
  submodels?: Submodel[];
  conceptDescriptions?: ConceptDescription[];
}

const CARDINALITY: Record<string, { min: number; max: number | null }> = {
  One: { min: 1, max: 1 },
  ZeroToOne: { min: 0, max: 1 },
  ZeroToMany: { min: 0, max: null },
  OneToMany: { min: 1, max: null },
};

/** urn:samm:ns:1.0.1#name -> urn:samm:ns#name (strips the version segment of SAMM URNs) */
const versionless = (id: string): string => id.replace(/:(\d+\.\d+\.\d+)#/, '#');

const DIN_CHAPTER = /DIN\s*DKE\s*Spec(?:ification)?\s*99100[^0-9]{0,60}?(\d+(?:\.\d+)+)/i;

const firstKey = (ref: Reference | undefined): string | null => ref?.keys?.[0]?.value ?? null;

const langMap = (items: LangString[] | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const item of items ?? []) {
    if (item.language && item.text !== undefined) out[item.language] = item.text;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

function parseCardinality(qualifiers: Qualifier[] | undefined): Cardinality {
  const q = (qualifiers ?? []).find(
    (x) => x.type === 'SMT/Cardinality' || x.type === 'Cardinality',
  );
  const raw = q?.value ?? null;
  if (raw === null) return { raw: null, min: null, max: null };
  const known = CARDINALITY[raw];
  return known ? { raw, min: known.min, max: known.max } : { raw, min: null, max: null };
}

function qualifierValue(qualifiers: Qualifier[] | undefined, ...types: string[]): string | null {
  const q = (qualifiers ?? []).find((x) => types.includes(x.type));
  return q?.value ?? null;
}

function conceptInfo(cd: ConceptDescription | undefined): ConceptInfo | null {
  const content = cd?.embeddedDataSpecifications?.[0]?.dataSpecificationContent;
  if (!content) return null;
  return {
    preferredName: langMap(content.preferredName),
    shortName: langMap(content.shortName),
    definition: langMap(content.definition),
    unit: content.unit ?? null,
    dataType: content.dataType ?? null,
    valueFormat: content.valueFormat ?? null,
  };
}

function exampleValueOf(element: SubmodelElement): string | null {
  const fromQualifier = qualifierValue(element.qualifiers, 'SMT/ExampleValue', 'ExampleValue');
  if (fromQualifier !== null) return fromQualifier;
  if (
    element.modelType === 'Property' &&
    typeof element.value === 'string' &&
    element.value !== ''
  ) {
    return element.value;
  }
  return null;
}

export function buildCatalogue(inputs: TemplateInput[]): TemplateCatalogue {
  const templates = [...inputs]
    .sort((a, b) => a.part - b.part)
    .map((input) => buildTemplate(input));
  return {
    $comment:
      'GENERATED by scripts/build-catalogue.ts from artefacts/idta/*/template.json. Do not edit. Every value is copied from the official IDTA 02035 templates; derived fields are path, cardinality.min/max and dinChapter.',
    templates,
  };
}

function buildTemplate(input: TemplateInput): CatalogueTemplate {
  const submodel = input.environment.submodels?.[0];
  if (!submodel) throw new Error(`Part ${input.part}: template has no submodel`);
  const concepts = new Map<string, ConceptDescription>();
  const conceptsVersionless = new Map<string, ConceptDescription>();
  for (const cd of input.environment.conceptDescriptions ?? []) {
    concepts.set(cd.id, cd);
    conceptsVersionless.set(versionless(cd.id), cd);
  }
  // Some templates (e.g. Part 6 v1.0.1) reference element semanticIds at 1.0.1 while their
  // ConceptDescriptions are still published under 1.0.0. Fall back to a version-agnostic match
  // on the same SAMM namespace and element name; the join kind is recorded per element.
  const lookupConcept = (
    semanticId: string | null,
  ): { cd: ConceptDescription | undefined; join: 'exact' | 'versionless' | null } => {
    if (semanticId === null) return { cd: undefined, join: null };
    const exact = concepts.get(semanticId);
    if (exact) return { cd: exact, join: 'exact' };
    const loose = conceptsVersionless.get(versionless(semanticId));
    return loose ? { cd: loose, join: 'versionless' } : { cd: undefined, join: null };
  };

  const submodelIdShort = submodel.idShort ?? `Part${input.part}`;
  const elements: CatalogueElement[] = [];
  const seen = new Set<string>();

  const walk = (items: SubmodelElement[] | undefined, parentPath: string, depth: number): void => {
    (items ?? []).forEach((element, index) => {
      const idShort = element.idShort ?? null;
      let path = `${parentPath}/${idShort ?? `[${index}]`}`;
      if (seen.has(path)) path = `${path}#${index}`;
      seen.add(path);
      const semanticId = firstKey(element.semanticId);
      const description = langMap(element.description);
      const descriptionText = Object.values(description).join('\n');
      const dinMatch = DIN_CHAPTER.exec(descriptionText);
      elements.push({
        path,
        part: input.part,
        submodelIdShort,
        idShort,
        depth,
        modelType: element.modelType,
        semanticId,
        supplementalSemanticIds: (element.supplementalSemanticIds ?? [])
          .map((r) => firstKey(r))
          .filter((v): v is string => v !== null),
        cardinality: parseCardinality(element.qualifiers),
        valueType: element.valueType ?? null,
        listElement:
          element.modelType === 'SubmodelElementList'
            ? {
                typeValueListElement: element.typeValueListElement ?? null,
                valueTypeListElement: element.valueTypeListElement ?? null,
                semanticIdListElement: firstKey(element.semanticIdListElement),
              }
            : null,
        exampleValue: exampleValueOf(element),
        eitherOrGroup: qualifierValue(element.qualifiers, 'SMT/EitherOr'),
        description,
        dinChapter: dinMatch?.[1] ?? null,
        concept: conceptInfo(lookupConcept(semanticId).cd),
        conceptJoin: lookupConcept(semanticId).join,
      });
      if (
        Array.isArray(element.value) &&
        ['SubmodelElementCollection', 'SubmodelElementList', 'Entity'].includes(element.modelType)
      ) {
        walk(element.value as SubmodelElement[], path, depth + 1);
      }
    });
  };
  walk(submodel.submodelElements, String(input.part), 0);

  return {
    part: input.part,
    idta: `IDTA 02035-${input.part}`,
    version: input.version,
    submodelIdShort,
    submodelId: submodel.id,
    submodelSemanticId: firstKey(submodel.semanticId),
    templateId: submodel.administration?.templateId ?? null,
    elementCount: elements.length,
    elements,
  };
}
