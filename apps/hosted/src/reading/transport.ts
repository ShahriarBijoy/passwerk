/**
 * The three ways a reader reaches Jev: the TypeSafe API, a recorded cassette, and the API with
 * every answer written into a cassette. The reader cannot tell them apart.
 */
import { canonicalJson, sha256Hex } from '@passwerk/core';
import { type Fetch, TypeSafeClient } from '@typesafe-ai/sdk';
import { z } from 'zod';
import type { Ask, JevRequest, JevResponse } from './types.js';

/** Pinned rather than `jev-latest`, so a cassette and a live run read with the same model. */
export const JEV_MODEL = 'jev-1.14.0';

export interface JevOptions {
  apiKey: string;
  model: string;
  /** Replaces the global fetch, for tests. */
  fetch?: Fetch;
}

const scrub = (text: string, secret: string) =>
  secret ? text.split(secret).join('[redacted]') : text;

function describe(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const parts = [e.constructor.name];
  const { status, requestId, body } = e as {
    status?: unknown;
    requestId?: unknown;
    body?: unknown;
  };
  if (status !== undefined) parts.push(`status ${String(status)}`);
  if (typeof requestId === 'string') parts.push(`request ${requestId}`);
  parts.push(body !== undefined ? JSON.stringify(body).slice(0, 400) : e.message.slice(0, 400));
  return parts.join(' ');
}

/** Errors leave this function as fresh `Error`s with the key scrubbed and no `cause` attached. */
export function jevAsk({ apiKey, model, fetch }: JevOptions): Ask {
  let client: TypeSafeClient;
  try {
    client = new TypeSafeClient({
      apiKey,
      logLevel: 'off',
      timeout: 60_000,
      retry: { maxRetries: 2 },
      ...(fetch ? { fetch } : {}),
    });
  } catch (e) {
    throw new Error(`TypeSafe client: ${scrub(describe(e), apiKey)}`);
  }
  return async (stage, request) => {
    if (request.model !== model)
      throw new Error(`${stage}: asked ${request.model}, pinned ${model}`);
    try {
      const r = await client.systemOne(request);
      // Readers ask only choice and noul questions, so only those answers come back.
      const answers = r.answers as JevResponse['answers'];
      return { model: r.model, answers, inputTokens: r.usage.input_tokens ?? 0 };
    } catch (e) {
      throw new Error(`Jev ${stage} request failed: ${scrub(describe(e), apiKey)}`);
    }
  };
}

/** Request order inside a stage does not matter: each request is looked up by its content. */
export async function fingerprint(request: JevRequest): Promise<string> {
  const text = JSON.stringify([request.model, request.state, request.questions]);
  return sha256Hex(new TextEncoder().encode(text));
}

const AnswerSchema = z.union([
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    confidence: z.number(),
    probabilities: z.record(z.string(), z.number()),
  }),
  z.object({ type: z.literal('noul'), noul: z.number() }),
]);

const CassetteSchema = z.object({
  model: z.string(),
  entries: z.record(
    z.string(),
    z.object({
      stage: z.string(),
      questions: z.array(z.string()),
      response: z.object({
        model: z.string(),
        answers: z.record(z.string(), AnswerSchema),
        inputTokens: z.number(),
      }),
    }),
  ),
});
export type Cassette = z.infer<typeof CassetteSchema>;

export function parseCassette(json: string): Cassette {
  return CassetteSchema.parse(JSON.parse(json));
}

export const RECORD_HINT =
  'Re-record with: pnpm --filter @passwerk/hosted exec tsx scripts/record-jev.ts <series>';

export function replayAsk(cassette: Cassette): Ask {
  return async (stage, request) => {
    if (request.model !== cassette.model) {
      throw new Error(
        `cassette holds ${cassette.model} answers, the reader asked ${request.model}`,
      );
    }
    const key = await fingerprint(request);
    const entry = cassette.entries[key];
    if (!entry) {
      const ids = Object.keys(request.questions);
      throw new Error(
        `no recorded Jev answer for the ${stage} request ${key.slice(0, 12)} (${ids.length} questions, first ${ids[0]}). ${RECORD_HINT}`,
      );
    }
    return entry.response as JevResponse;
  };
}

export interface Recording {
  ask: Ask;
  cassette: Cassette;
  /** Wall time per request in milliseconds, in completion order. */
  latencies: { stage: string; questions: number; inputTokens: number; ms: number }[];
}

/**
 * Zero probabilities are dropped, and the reader gets the same trimmed answers a replay gives it,
 * so a recorded run and its replay decide identically.
 */
export function recordingAsk(inner: Ask, model: string): Recording {
  const cassette: Cassette = { model, entries: {} };
  const latencies: Recording['latencies'] = [];
  const ask: Ask = async (stage, request) => {
    const started = performance.now();
    const response = await inner(stage, request);
    const ms = Math.round(performance.now() - started);
    const answers = Object.fromEntries(
      Object.entries(response.answers).map(([id, a]) => [
        id,
        a.type === 'choice'
          ? {
              ...a,
              probabilities: Object.fromEntries(
                Object.entries(a.probabilities).filter(([, p]) => p > 0),
              ),
            }
          : a,
      ]),
    );
    const recorded = { ...response, answers } as JevResponse;
    cassette.entries[await fingerprint(request)] = {
      stage,
      questions: Object.keys(request.questions),
      response: recorded,
    };
    latencies.push({
      stage,
      questions: Object.keys(request.questions).length,
      inputTokens: response.inputTokens,
      ms,
    });
    return recorded;
  };
  return { ask, cassette, latencies };
}

export const cassetteJson = (cassette: Cassette): string => canonicalJson(cassette);
