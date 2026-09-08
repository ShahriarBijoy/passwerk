import { buildPrompt } from '../../workflow/assist/prompt.ts';
import type { AssistClient } from '../../workflow/assist/types.ts';
import { type AssistConfig, buildCall, readText } from './providers.ts';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** How much of a failed response body to quote back. Enough to see the provider's message. */
const ERROR_BODY_MAX = 800;

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * The one place in the app that reaches the network. Everything it sends is built by the pure
 * layer from an `AssistRequest`, which carries no provenance; everything it returns is the
 * model's raw text for `parseResponse` to judge.
 */
export function makeAssistClient(
  config: AssistConfig,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): AssistClient {
  return async (request, signal) => {
    const call = buildCall(config, buildPrompt(request));
    let response: Response;
    try {
      response = await fetchImpl(call.url, {
        method: 'POST',
        headers: call.headers,
        body: call.body,
        signal,
      });
    } catch (e) {
      // An abort is the reviewer's own doing and must read as one.
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      // A CORS refusal or an unreachable local runner arrives as a bare "Failed to fetch",
      // which does not say which endpoint failed.
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`Could not reach ${hostOf(call.url)}: ${detail}`);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `${hostOf(call.url)} answered ${response.status}:\n\n${text.slice(0, ERROR_BODY_MAX)}`,
      );
    }
    let answer: unknown;
    try {
      answer = JSON.parse(text);
    } catch {
      throw new Error(
        `${hostOf(call.url)} answered with something that is not JSON:\n\n${text.slice(0, ERROR_BODY_MAX)}`,
      );
    }
    return readText(config.provider, answer);
  };
}
