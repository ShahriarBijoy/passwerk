/**
 * Shared types for the @passwerk/rules data. Browser-safe: types only.
 * The generator scripts (scripts/lib) import these so generated JSON and runtime agree.
 */

export const BATTERY_CATEGORIES = ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'] as const;
export type BatteryCategory = (typeof BATTERY_CATEGORIES)[number];

export type ApplicabilityStatus =
  | 'mandatory'
  | 'optional'
  | 'conditional'
  | 'not_yet_applicable'
  | 'not_displayed';

export interface ApplicabilityCell {
  status: ApplicabilityStatus;
  /** Guidance wording where the cell is not plain "Mandatory" */
  text?: string;
  footnote?: string;
}

export type LangText = { en: string; de: string };

// ---------------------------------------------------------------------------
// kb/ec-datapoints.json
// ---------------------------------------------------------------------------
export interface EcDataPoint {
  number: number;
  name: string;
  legalRef: string;
  applicability: Record<BatteryCategory, ApplicabilityCell>;
}

export interface EcDataPoints {
  $comment: string;
  source: Record<string, unknown>;
  categories: readonly BatteryCategory[];
  statusVocabulary: Record<ApplicabilityStatus, string>;
  dataPoints: EcDataPoint[];
}

// ---------------------------------------------------------------------------
// kb/generated/template-catalogue.json
// ---------------------------------------------------------------------------
export interface Cardinality {
  raw: string | null;
  min: number | null;
  max: number | null;
}

export interface ConceptInfo {
  preferredName: Record<string, string>;
  shortName: Record<string, string>;
  definition: Record<string, string>;
  unit: string | null;
  dataType: string | null;
  valueFormat: string | null;
}

export interface CatalogueElement {
  path: string;
  part: number;
  submodelIdShort: string;
  idShort: string | null;
  depth: number;
  modelType: string;
  semanticId: string | null;
  supplementalSemanticIds: string[];
  cardinality: Cardinality;
  valueType: string | null;
  listElement: {
    typeValueListElement: string | null;
    valueTypeListElement: string | null;
    semanticIdListElement: string | null;
  } | null;
  exampleValue: string | null;
  eitherOrGroup: string | null;
  description: Record<string, string>;
  dinChapter: string | null;
  concept: ConceptInfo | null;
  conceptJoin: 'exact' | 'versionless' | null;
}

export interface CatalogueTemplate {
  part: number;
  idta: string;
  version: string;
  submodelIdShort: string;
  submodelId: string;
  submodelSemanticId: string | null;
  templateId: string | null;
  elementCount: number;
  elements: CatalogueElement[];
}

export interface TemplateCatalogue {
  $comment: string;
  templates: CatalogueTemplate[];
}

// ---------------------------------------------------------------------------
// kb/generated/din-longlist.json
// ---------------------------------------------------------------------------
export interface LonglistRow {
  no: number;
  dinChapter: string;
  applicability: { ev: string; lmt: string; industrialOther: string; stationary: string };
  category: string;
  subCategory: string;
  attribute: string;
  definition: string;
  requirementsRegulation: string;
  requirementsDin: string;
  regulationRef: string;
  unit: string;
  dataFormat: string;
  accessRights: string;
  staticDynamic: string;
  updateRequirement: string;
  granularityModelVsIndividual: string;
  granularity: { pack: string; module: string; cell: string };
}

export interface Longlist {
  $comment: string;
  sheet: string;
  rows: LonglistRow[];
}

// ---------------------------------------------------------------------------
// kb/attributes/*.json (authored)
// ---------------------------------------------------------------------------
export type ValueKind =
  | 'identifier'
  | 'text'
  | 'multilingualText'
  | 'decimal'
  | 'integer'
  | 'percentage'
  | 'date'
  | 'dateTime'
  | 'boolean'
  | 'enum'
  | 'document'
  | 'uri'
  | 'graphic'
  | 'composite';

export interface ApplicabilityOverride extends Record<BatteryCategory, ApplicabilityCell> {
  source: string;
}

export interface AuthoredAttribute {
  id: string;
  din: { no: number; chapter: string };
  ecDataPoints: number[];
  part: number | null;
  templatePaths: string[];
  name: LangText;
  synonyms: { en: string[]; de: string[] };
  valueKind: ValueKind;
  unit: string | null;
  range: { min: number | null; max: number | null } | null;
  whoTypicallyHasIt: LangText;
  explanation: LangText;
  applicabilityOverride: ApplicabilityOverride | null;
  verify: boolean;
  lastVerified: string;
}

export interface AttributeFile {
  $comment: string;
  category: string;
  attributes: AuthoredAttribute[];
}

/** An authored attribute joined with everything derivable from the official sources. */
export interface Attribute extends AuthoredAttribute {
  /** DIN DKE SPEC 99100 category name from the longlist file */
  category: string;
  /** Longlist row (definition, static/dynamic, access rights, granularity, ...) */
  din: { no: number; chapter: string; row: LonglistRow };
  /** Commission data points referenced by this attribute, primary first */
  ec: EcDataPoint[];
  /** Effective applicability per category: from the primary EC data point, else the override */
  applicability: Record<BatteryCategory, ApplicabilityCell>;
  /** Where the applicability came from */
  applicabilitySource: 'ec' | 'override';
  /** Legal references: EC data point refs first, then the longlist regulation reference */
  legalRefs: string[];
  /** Template elements resolved from templatePaths */
  templateElements: CatalogueElement[];
  /** True when the longlist marks the attribute as dynamic (in-use data) */
  dynamic: boolean;
}

// ---------------------------------------------------------------------------
// kb/rules.json
// ---------------------------------------------------------------------------
export interface PlausibilityRule {
  id: string;
  severity: 'error' | 'warning';
  title: LangText;
  message: LangText;
  fixHint: LangText;
  attributes: string[];
  legalRef: string | null;
}

export interface RulesFile {
  $comment: string;
  lastVerified: string;
  rules: PlausibilityRule[];
}

// ---------------------------------------------------------------------------
// kb/timeline.json
// ---------------------------------------------------------------------------
export type TimelineStatus = 'in_force' | 'scheduled' | 'pending_act' | 'superseded';

export interface TimelineEvent {
  id: string;
  date: string;
  dateRule: 'fixed' | 'latest_of';
  alternative?: string;
  title: LangText;
  legalRef: string;
  appliesTo: BatteryCategory[];
  status: TimelineStatus;
  note?: LangText;
  thresholds?: Record<string, number>;
  affectsAttributes: string[];
  verify: boolean;
}

export interface Timeline {
  $comment: string;
  lastVerified: string;
  sources: Record<string, Record<string, unknown>>;
  events: TimelineEvent[];
}

// ---------------------------------------------------------------------------
// artefacts/manifest.json
// ---------------------------------------------------------------------------
export interface ArtefactEntry {
  id: string;
  source: string;
  title: string;
  version: string;
  url: string;
  path: string | null;
  sha256: string;
  bytes: number;
}

export interface ArtefactManifest {
  $comment: string;
  retrievedAt: string;
  sources: Record<string, Record<string, string>>;
  artefacts: ArtefactEntry[];
}

// ---------------------------------------------------------------------------
// Battery Pass Data Model (SAMM) index: kb/generated/batterypass-samm.json
// Dev-time cross-check only; the runtime never loads it (ADR D-030).
// ---------------------------------------------------------------------------

export interface SammCharacteristic {
  /** Local name of the characteristic the property points at (a Trait keeps its own name). */
  name: string | null;
  /** SAMM characteristic kind after resolving a Trait: Measurement, Enumeration, List, ... */
  kind: string | null;
  /** "xsd:float" and friends; null when the data type is an Entity. */
  dataType: string | null;
  /** SAMM unit local name (e.g. "percent"), or the symbol of a model-local samm:Unit. */
  unit: string | null;
  /** Symbol of a model-local samm:Unit, when the unit is not a SAMM catalogue unit. */
  unitSymbol: string | null;
  /** Enumeration values in declaration order, duplicates removed. */
  values: string[] | null;
  /** Local name of the Entity data type, when the characteristic is entity-valued. */
  entity: string | null;
  /** RangeConstraint bounds as literal strings, from a Trait. */
  range: { min: string | null; max: string | null } | null;
}

export interface SammProperty {
  name: string;
  urn: string;
  preferredName: string | null;
  description: string | null;
  /** Parsed from the "DIN DKE Spec 99100 chapter reference" sentence of the description. */
  dinChapters: string[];
  /** Aspect / entity walk, e.g. "Circularity/sparePartSources/addressOfSupplier". */
  paths: string[];
  optional: boolean;
  characteristic: SammCharacteristic;
}

export interface SammSection {
  key: string;
  version: string;
  file: string;
  aspect: string;
  namespace: string;
  description: string | null;
  propertyCount: number;
  properties: SammProperty[];
}

export interface SammModel {
  $comment: string;
  sections: SammSection[];
}

/** Minimal shape of an AAS V3.0 JSON Environment as shipped in the templates. */
export interface AasEnvironment {
  assetAdministrationShells?: unknown[];
  submodels?: unknown[];
  conceptDescriptions?: unknown[];
}
