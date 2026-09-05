import { applyMappingsTool } from './tools/applyMappings.js';
import { checkObligationsTool } from './tools/checkObligations.js';
import { explainAttributeTool } from './tools/explainAttribute.js';
import { gapReportTool } from './tools/gapReport.js';
import { listCapabilitiesTool, setToolNames } from './tools/listCapabilities.js';
import { validatePassportTool } from './tools/validatePassport.js';
import type { AnyToolDefinition } from './types.js';

/**
 * The single description of the tool surface (spec section 3.2). `createServer` registers
 * it; the CLI turns it into `passwerk tools` and Anthropic tool definitions; the sovereignty
 * test iterates it.
 */
export const TOOLS: readonly AnyToolDefinition[] = [
  applyMappingsTool,
  validatePassportTool,
  gapReportTool,
  checkObligationsTool,
  explainAttributeTool,
  listCapabilitiesTool,
];

setToolNames(TOOLS.map((t) => t.name));

export function toolByName(name: string): AnyToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}
