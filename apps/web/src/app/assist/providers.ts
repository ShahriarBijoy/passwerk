/**
 * The two request envelopes, as pure functions. Every endpoint string in the app lives here,
 * in the `app` layer: `workflow` never learns what a URL is, and the MCP App — which supplies
 * no `Platform.assist` — cannot bundle one (asserted in `boundary.test.ts`).
 */

import type { Prompt } from '../../workflow/assist/prompt.ts';
import type { AssistConfig, AssistProvider } from '../../workflow/assist/types.ts';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

export const DEFAULT_MODELS: Record<AssistProvider, string> = {
  // The model `passwerk chat` defaults to (ADR D-032), so the two demo surfaces agree.
  anthropic: 'claude-sonnet-5',
  'openai-compatible': 'gpt-4o-mini',
};

/** Enough for a few dozen suggestions with a sentence each; the answer is a small JSON object. */
const MAX_TOKENS = 4096;

export type { AssistConfig };

export interface AssistCall {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function completionsUrl(baseUrl: string | undefined): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl ?? '');
  } catch {
    throw new Error(`Not a valid base URL: "${baseUrl ?? ''}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`A base URL must be http or https, got "${parsed.protocol}"`);
  }
  return `${parsed.href.replace(/\/+$/, '')}/chat/completions`;
}

export function buildCall(config: AssistConfig, prompt: Prompt): AssistCall {
  if (config.provider === 'anthropic') {
    return {
      url: ANTHROPIC_URL,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        // Without this the browser request is refused by CORS preflight. It is the documented
        // opt-in for calling the API straight from a page (ADR D-038).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: MAX_TOKENS,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    };
  }
  return {
    url: completionsUrl(config.baseUrl),
    headers: {
      'content-type': 'application/json',
      // A local runner (Ollama, LM Studio) needs no key, and sending an empty bearer token
      // makes some of them reject the request outright.
      ...(config.apiKey === '' ? {} : { authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    }),
  };
}

const errorIn = (answer: unknown): string | undefined => {
  const error = (answer as { error?: { message?: unknown } } | null)?.error;
  return typeof error?.message === 'string' ? error.message : undefined;
};

/** The model's text, or a thrown error naming what came back instead. Never a silent ''. */
export function readText(provider: AssistProvider, answer: unknown): string {
  const reported = errorIn(answer);
  if (reported !== undefined) throw new Error(reported);
  if (provider === 'anthropic') {
    const blocks = (answer as { content?: unknown })?.content;
    const text = Array.isArray(blocks)
      ? blocks
          .filter(
            (b): b is { type: 'text'; text: string } =>
              typeof b === 'object' &&
              b !== null &&
              (b as { type?: unknown }).type === 'text' &&
              typeof (b as { text?: unknown }).text === 'string',
          )
          .map((b) => b.text)
          .join('')
      : '';
    if (text === '') throw new Error('The answer carried no text block.');
    return text;
  }
  const choice = (answer as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || content === '') {
    throw new Error('The answer carried no message content.');
  }
  return content;
}

/** The host a run would reach, for the disclosure panel. Display only; never a request. */
export function endpointLabel(config: AssistConfig): string {
  if (config.provider === 'anthropic') return new URL(ANTHROPIC_URL).host;
  const base = config.baseUrl ?? '';
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}
