/**
 * @passwerk/core: MCP-free library for EU Digital Battery Passports.
 * Phase 2: PassportDraft model (L1), AAS JSON + AASX emitters for IDTA 02035-1/-3/-6,
 * L2 (aas-core verification) and L3 (template conformance).
 * Phase 3b: emitters for parts 4, 5 and 7.
 * Phase 4: ingest (PDF, XLSX, CSV, DOCX, TXT), extract and mapping, and the part 2
 * (Handover Documentation) emitter. Browser-safe (ADR D-006).
 */
export const PACKAGE_NAME = '@passwerk/core' as const;

export * from './emit/aasJson.js';
export * from './emit/aasx.js';
export * from './emit/canonical.js';
export * from './emit/elements.js';
export * from './emit/environment.js';
export * from './emit/ids.js';
export * from './emit/submodels/carbonFootprint.js';
export * from './emit/submodels/circularity.js';
export * from './emit/submodels/handoverDocumentation.js';
export * from './emit/submodels/materialComposition.js';
export * from './emit/submodels/nameplate.js';
export * from './emit/submodels/productCondition.js';
export {
  documentIds,
  integral,
  submodelFromTemplate,
  templateCategory,
  timestamp,
} from './emit/submodels/shared.js';
export * from './emit/submodels/technicalData.js';
export * from './extract/dates.js';
export * from './extract/facts.js';
export * from './extract/normalize.js';
export * from './extract/numbers.js';
export * from './extract/types.js';
export * from './extract/units.js';
export * from './gap/action.js';
export * from './gap/report.js';
export * from './ingest/csv.js';
export * from './ingest/docx.js';
export * from './ingest/index.js';
export * from './ingest/lang.js';
export * from './ingest/layout.js';
export * from './ingest/ooxml.js';
export * from './ingest/pdf.js';
export * from './ingest/refs.js';
export * from './ingest/text.js';
export * from './ingest/txt.js';
export * from './ingest/types.js';
export * from './ingest/xlsx.js';
export * from './mapping/apply.js';
export * from './mapping/propose.js';
export * from './mapping/scorer.js';
export * from './mapping/synonymIndex.js';
export * from './mapping/types.js';
export * from './model/attributeIds.js';
export * from './model/composites.js';
export * from './model/field.js';
export * from './model/passport.js';
export * from './model/provenance.js';
export * from './model/values.js';
export * from './samples/index.js';
export * from './validate/aas.js';
export * from './validate/finding.js';
export * from './validate/index.js';
export { message as findingMessage, RULE_IDS } from './validate/messages.js';
export * from './validate/plausibility/checks.js';
export * from './validate/plausibility/context.js';
export * from './validate/plausibility.js';
export * from './validate/schema.js';
export * from './validate/template.js';
