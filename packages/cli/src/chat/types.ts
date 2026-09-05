/**
 * Type-only view of the Anthropic SDK. `import type` is erased at runtime, so no command
 * loads `@anthropic-ai/sdk` unless `chat` imports it lazily (spec section 5).
 */
import type Anthropic from '@anthropic-ai/sdk';

export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;
