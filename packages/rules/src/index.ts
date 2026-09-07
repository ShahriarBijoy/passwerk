/**
 * @passwerk/rules: bundled, checksummed, offline artefacts and knowledge base for the
 * EU Digital Battery Passport.
 *
 * Everything exported here is data resolved at module load from JSON that ships inside the
 * package. No filesystem, no network, no Node-only APIs: this module runs unchanged in the
 * browser (docs/DECISIONS.md D-006).
 */

import aasSchema309 from '../artefacts/aas/3.0.9/aas.json' with { type: 'json' };
import aasSchema312 from '../artefacts/aas/3.1.2/aas.json' with { type: 'json' };
import template1 from '../artefacts/idta/02035-1/1.0/template.json' with { type: 'json' };
import template2 from '../artefacts/idta/02035-2/1.0/template.json' with { type: 'json' };
import template3 from '../artefacts/idta/02035-3/1.0/template.json' with { type: 'json' };
import template4 from '../artefacts/idta/02035-4/1.0.1/template.json' with { type: 'json' };
import template5 from '../artefacts/idta/02035-5/1.0.2/template.json' with { type: 'json' };
import template6 from '../artefacts/idta/02035-6/1.0.1/template.json' with { type: 'json' };
import template7 from '../artefacts/idta/02035-7/1.0.1/template.json' with { type: 'json' };
import manifestJson from '../artefacts/manifest.json' with { type: 'json' };
import attributes01 from '../kb/attributes/01-identifiers.json' with { type: 'json' };
import attributes02 from '../kb/attributes/02-labels-conformity.json' with { type: 'json' };
import attributes03 from '../kb/attributes/03-carbon-footprint.json' with { type: 'json' };
import attributes04 from '../kb/attributes/04-due-diligence.json' with { type: 'json' };
import attributes05 from '../kb/attributes/05-materials.json' with { type: 'json' };
import attributes06 from '../kb/attributes/06-circularity.json' with { type: 'json' };
import attributes07 from '../kb/attributes/07-performance-electrical.json' with { type: 'json' };
import attributes08 from '../kb/attributes/08-performance-lifetime.json' with { type: 'json' };
import carrierJson from '../kb/carrier.json' with { type: 'json' };
import ecJson from '../kb/ec-datapoints.json' with { type: 'json' };
import longlistJson from '../kb/generated/din-longlist.json' with { type: 'json' };
import catalogueJson from '../kb/generated/template-catalogue.json' with { type: 'json' };
import rulesJson from '../kb/rules.json' with { type: 'json' };
import timelineJson from '../kb/timeline.json' with { type: 'json' };
import type {
  AasEnvironment,
  ApplicabilityCell,
  ArtefactManifest,
  Attribute,
  AttributeFile,
  BatteryCategory,
  CarrierFile,
  CarrierScheme,
  CatalogueElement,
  CatalogueTemplate,
  EcDataPoint,
  EcDataPoints,
  Longlist,
  PlausibilityRule,
  RulesFile,
  TemplateCatalogue,
  Timeline,
  TimelineEvent,
} from './types.js';

export * from './types.js';
export { BATTERY_CATEGORIES } from './types.js';

export const PACKAGE_NAME = '@passwerk/rules' as const;

// ---------------------------------------------------------------------------
// Raw data (typed views over the bundled JSON)
// ---------------------------------------------------------------------------
export const artefactManifest = manifestJson as unknown as ArtefactManifest;
export const ecDataPoints = ecJson as unknown as EcDataPoints;
export const dinLonglist = longlistJson as unknown as Longlist;
export const templateCatalogue = catalogueJson as unknown as TemplateCatalogue;
export const plausibilityRules = (rulesJson as unknown as RulesFile).rules;
export const carrierSchemes: CarrierScheme[] = (carrierJson as unknown as CarrierFile).schemes;
export const timeline = timelineJson as unknown as Timeline;

/** AAS metamodel JSON Schemas, keyed by IDTA-01001 schema version. */
export const aasJsonSchemas: Record<'3.0.9' | '3.1.2', unknown> = {
  '3.0.9': aasSchema309,
  '3.1.2': aasSchema312,
};

export interface BundledTemplate {
  part: number;
  idta: string;
  version: string;
  submodelIdShort: string;
  submodelSemanticId: string | null;
  /** The official template.json (AAS V3.0 Environment, kind=Template, with example values) */
  environment: AasEnvironment;
  /** The flattened element index for this template */
  catalogue: CatalogueTemplate;
}

const templateEnvironments: Record<number, AasEnvironment> = {
  1: template1 as AasEnvironment,
  2: template2 as AasEnvironment,
  3: template3 as AasEnvironment,
  4: template4 as AasEnvironment,
  5: template5 as AasEnvironment,
  6: template6 as AasEnvironment,
  7: template7 as AasEnvironment,
};

/** The seven IDTA 02035 submodel templates, ordered by part. */
export const templates: BundledTemplate[] = templateCatalogue.templates.map((catalogue) => {
  const environment = templateEnvironments[catalogue.part];
  if (!environment)
    throw new Error(`@passwerk/rules: no bundled template for part ${catalogue.part}`);
  return {
    part: catalogue.part,
    idta: catalogue.idta,
    version: catalogue.version,
    submodelIdShort: catalogue.submodelIdShort,
    submodelSemanticId: catalogue.submodelSemanticId,
    environment,
    catalogue,
  };
});

// ---------------------------------------------------------------------------
// Attribute knowledge base, joined with EC data points, longlist and template catalogue
// ---------------------------------------------------------------------------
const attributeFiles = [
  attributes01,
  attributes02,
  attributes03,
  attributes04,
  attributes05,
  attributes06,
  attributes07,
  attributes08,
] as unknown as AttributeFile[];

const elementsByPath = new Map<string, CatalogueElement>();
for (const template of templateCatalogue.templates) {
  for (const element of template.elements) elementsByPath.set(element.path, element);
}
const ecByNumber = new Map<number, EcDataPoint>(ecDataPoints.dataPoints.map((d) => [d.number, d]));
const longlistByNo = new Map(dinLonglist.rows.map((r) => [r.no, r]));

function resolveAttribute(
  file: AttributeFile,
  authored: AttributeFile['attributes'][number],
): Attribute {
  const row = longlistByNo.get(authored.din.no);
  if (!row)
    throw new Error(
      `@passwerk/rules: ${authored.id} references unknown longlist row ${authored.din.no}`,
    );
  const ec = authored.ecDataPoints.map((n) => {
    const dp = ecByNumber.get(n);
    if (!dp)
      throw new Error(`@passwerk/rules: ${authored.id} references unknown EC data point ${n}`);
    return dp;
  });
  const templateElements = authored.templatePaths.map((path) => {
    const element = elementsByPath.get(path);
    if (!element)
      throw new Error(`@passwerk/rules: ${authored.id} references unknown template path ${path}`);
    return element;
  });

  let applicability: Record<BatteryCategory, ApplicabilityCell>;
  let applicabilitySource: Attribute['applicabilitySource'];
  const primary = ec[0];
  if (primary) {
    applicability = primary.applicability;
    applicabilitySource = 'ec';
  } else if (authored.applicabilityOverride) {
    const { source: _source, ...cells } = authored.applicabilityOverride;
    applicability = cells;
    applicabilitySource = 'override';
  } else {
    throw new Error(
      `@passwerk/rules: ${authored.id} has neither EC data points nor an applicability override`,
    );
  }

  const legalRefs = [
    ...new Set([
      ...ec.map((d) => d.legalRef),
      ...(row.regulationRef && row.regulationRef !== 'n.a.'
        ? [`DIN longlist: ${row.regulationRef}`]
        : []),
    ]),
  ];

  return {
    ...authored,
    category: file.category,
    din: { ...authored.din, row },
    ec,
    applicability,
    applicabilitySource,
    legalRefs,
    templateElements,
    dynamic: /dynamic/i.test(row.staticDynamic),
  };
}

/** All 93 attributes (DIN DKE SPEC 99100 grain), fully resolved, in longlist order. */
export const attributes: Attribute[] = attributeFiles
  .flatMap((file) => file.attributes.map((a) => resolveAttribute(file, a)))
  .sort((a, b) => a.din.no - b.din.no);

const attributesById = new Map(attributes.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
export function getAttribute(id: string): Attribute | undefined {
  return attributesById.get(id);
}

/** Attributes whose effective status for `category` is one of `statuses` (default: mandatory). */
export function getAttributesForCategory(
  category: BatteryCategory,
  statuses: readonly ApplicabilityCell['status'][] = ['mandatory'],
): Attribute[] {
  return attributes.filter((a) => statuses.includes(a.applicability[category].status));
}

export function getEcDataPoint(number: number): EcDataPoint | undefined {
  return ecByNumber.get(number);
}

export function getTemplate(part: number): BundledTemplate | undefined {
  return templates.find((t) => t.part === part);
}

export function getTemplateElement(path: string): CatalogueElement | undefined {
  return elementsByPath.get(path);
}

/** Template elements that carry a given attribute, or attributes that map to a given path. */
export function getAttributesForTemplatePath(path: string): Attribute[] {
  return attributes.filter((a) => a.templatePaths.includes(path));
}

export function getRule(id: string): PlausibilityRule | undefined {
  return plausibilityRules.find((r) => r.id === id);
}

export function getCarrierScheme(id: string): CarrierScheme | undefined {
  return carrierSchemes.find((s) => s.id === id);
}

/** Timeline events that apply to a category, sorted by date. */
export function getTimeline(category?: BatteryCategory): TimelineEvent[] {
  return timeline.events
    .filter((e) => category === undefined || e.appliesTo.includes(category))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Capabilities (what `list_capabilities` reports)
// ---------------------------------------------------------------------------
export interface Capabilities {
  package: typeof PACKAGE_NAME;
  templates: { part: number; idta: string; version: string; sha256: string }[];
  aasSchemaVersions: string[];
  ecGuidance: { version: string; date: string; dataPoints: number };
  knowledgeBase: {
    attributes: number;
    attributesToVerify: number;
    dinLonglistRows: number;
    plausibilityRules: number;
    timelineEvents: number;
    languages: string[];
  };
  artefactsRetrievedAt: string;
  sovereignty: string;
}

export function listCapabilities(): Capabilities {
  const sha = (id: string): string =>
    artefactManifest.artefacts.find((a) => a.id === id)?.sha256 ?? '';
  return {
    package: PACKAGE_NAME,
    templates: templates.map((t) => ({
      part: t.part,
      idta: t.idta,
      version: t.version,
      sha256: sha(`idta-02035-${t.part}/template.json`),
    })),
    aasSchemaVersions: Object.keys(aasJsonSchemas),
    ecGuidance: {
      version: String((ecDataPoints.source as { version?: string }).version ?? ''),
      date: String((ecDataPoints.source as { date?: string }).date ?? ''),
      dataPoints: ecDataPoints.dataPoints.length,
    },
    knowledgeBase: {
      attributes: attributes.length,
      attributesToVerify: attributes.filter((a) => a.verify).length,
      dinLonglistRows: dinLonglist.rows.length,
      plausibilityRules: plausibilityRules.length,
      timelineEvents: timeline.events.length,
      languages: ['de', 'en'],
    },
    artefactsRetrievedAt: artefactManifest.retrievedAt,
    sovereignty:
      'All standards, templates and legal references are bundled and checksummed. This package makes no network calls and calls no language model.',
  };
}
