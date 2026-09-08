import { type BuildRequestInput, buildRequest } from './request.ts';
import { parseResponse } from './response.ts';
import type { AssistClient, AssistResult } from './types.ts';

export interface RunAssistInput extends BuildRequestInput {
  client: AssistClient;
}

const NOTHING: AssistResult = { suggestions: [], critiques: [], discards: [] };

/**
 * One run: build the request, ask the model once, judge the answer. No retry and no repair —
 * a failed run says so, and the reviewer decides whether to run it again.
 */
export async function runAssist(input: RunAssistInput, signal: AbortSignal): Promise<AssistResult> {
  const { client, ...rest } = input;
  const { request, refs } = buildRequest(rest);
  // Nothing unplaced and nothing to second-guess: no call, no key spent, no data sent.
  if (request.facts.length === 0 && request.proposals.length === 0) return NOTHING;
  const text = await client(request, signal);
  return parseResponse(text, {
    refs,
    category: rest.category,
    facts: rest.facts,
    decisions: rest.decisions,
  });
}
