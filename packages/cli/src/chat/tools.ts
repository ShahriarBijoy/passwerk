import type Anthropic from '@anthropic-ai/sdk';
import { LangSchema, TOOLS } from '@passwerk/server';
import { z } from 'zod';

/**
 * The registry as Anthropic tool definitions: the same input shape the MCP server exposes,
 * `lang` included, so the model sees what an MCP host sees.
 */
export function anthropicTools(): Anthropic.Tool[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(
      z.object({
        ...t.inputSchema,
        lang: LangSchema.optional().describe('Language of the text summary (default en)'),
      }),
      { io: 'input' },
    ) as Anthropic.Tool.InputSchema,
  }));
}
