/**
 * @passwerk/core: MCP-free library for EU Digital Battery Passports.
 * Phase 2: PassportDraft model (L1), AAS JSON + AASX emitters for IDTA 02035-1/-3/-6,
 * L2 (aas-core verification) and L3 (template conformance). Browser-safe (ADR D-006).
 */
export const PACKAGE_NAME = '@passwerk/core' as const;

export * from './emit/aasJson.js';
export * from './emit/aasx.js';
export * from './emit/canonical.js';
export * from './emit/elements.js';
export * from './emit/environment.js';
export * from './emit/ids.js';
export * from './emit/submodels/carbonFootprint.js';
export * from './emit/submodels/materialComposition.js';
export * from './emit/submodels/nameplate.js';
export { submodelFromTemplate } from './emit/submodels/shared.js';
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
export * from './validate/schema.js';
export * from './validate/template.js';
