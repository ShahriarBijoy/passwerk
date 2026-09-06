import { applyMappingsTool } from './tools/applyMappings.js';
import { checkObligationsTool } from './tools/checkObligations.js';
import { emitPassportTool } from './tools/emitPassport.js';
import { explainAttributeTool } from './tools/explainAttribute.js';
import { extractFactsTool } from './tools/extractFacts.js';
import { gapReportTool } from './tools/gapReport.js';
import { generateCarrierTool } from './tools/generateCarrier.js';
import { ingestDocumentsTool } from './tools/ingestDocuments.js';
import { listCapabilitiesTool, setToolNames } from './tools/listCapabilities.js';
import { suggestMappingsTool } from './tools/suggestMappings.js';
import { validatePassportTool } from './tools/validatePassport.js';
import type { AnyToolDefinition } from './types.js';

/**
 * The single description of the tool surface (spec section 3.2). `createServer` registers
 * it; the CLI turns it into `passwerk tools` and Anthropic tool definitions; the sovereignty
 * test iterates it.
 */
export const TOOLS: readonly AnyToolDefinition[] = [
  ingestDocumentsTool,
  extractFactsTool,
  suggestMappingsTool,
  applyMappingsTool,
  validatePassportTool,
  gapReportTool,
  emitPassportTool,
  generateCarrierTool,
  checkObligationsTool,
  explainAttributeTool,
  listCapabilitiesTool,
];

setToolNames(TOOLS.map((t) => t.name));

export function toolByName(name: string): AnyToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}
