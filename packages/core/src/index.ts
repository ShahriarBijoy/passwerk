/**
 * @passwerk/core: MCP-free library for EU Digital Battery Passports.
 * Phase 2: PassportDraft model (L1), AAS JSON + AASX emitters for IDTA 02035-1/-3/-6,
 * L2 (aas-core verification) and L3 (template conformance). Browser-safe (ADR D-006).
 */
export const PACKAGE_NAME = '@passwerk/core' as const;

export * from './model/attributeIds.js';
export * from './model/composites.js';
export * from './model/field.js';
export * from './model/passport.js';
export * from './model/provenance.js';
export * from './model/values.js';
export * from './samples/index.js';
export * from './validate/finding.js';
export { message as findingMessage, RULE_IDS } from './validate/messages.js';
export * from './validate/schema.js';
