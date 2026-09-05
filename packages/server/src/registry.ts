import { listCapabilitiesTool, setToolNames } from './tools/listCapabilities.js';
import type { AnyToolDefinition } from './types.js';

/**
 * The single description of the tool surface (spec section 3.2). `createServer` registers
 * it; the CLI turns it into `passwerk tools` and Anthropic tool definitions; the sovereignty
 * test iterates it.
 */
export const TOOLS: readonly AnyToolDefinition[] = [listCapabilitiesTool];

setToolNames(TOOLS.map((t) => t.name));

export function toolByName(name: string): AnyToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}
