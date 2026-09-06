/**
 * The chat demo loop with a scripted client. No test contacts Anthropic: `io.anthropic`
 * returns a fake `createMessage` that walks the same tool chain a host model would.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { type CreateMessage, run } from '@passwerk/cli';
import type { MappingProposal } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { captureIo, MUSTERWERK, musterwerkFiles, sampleFiles } from './harness.ts';

type Params = Anthropic.MessageCreateParamsNonStreaming;
type Step = (params: Params, lastResults: Record<string, unknown>[]) => Anthropic.Message | null;

const message = (
  content: Anthropic.ContentBlock[],
  stop_reason: Anthropic.Message['stop_reason'],
): Anthropic.Message => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'fake',
  content,
  stop_reason,
  stop_sequence: null,
  stop_details: null,
  container: null,
  usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Usage,
});

const text = (t: string): Anthropic.TextBlock => ({ type: 'text', text: t, citations: null });
const call = (name: string, input: unknown, n: number): Anthropic.ToolUseBlock => ({
  type: 'tool_use',
  id: `toolu_${n}`,
  name,
  input,
  caller: { type: 'direct' },
});

/** Tool results the loop sent back on the latest user turn, parsed from the JSON tail. */
function lastToolResults(params: Params): Record<string, unknown>[] {
  const last = params.messages.at(-1);
  if (!last || last.role !== 'user' || typeof last.content === 'string') return [];
  return last.content.flatMap((b) => {
    if (b.type !== 'tool_result' || typeof b.content !== 'string') return [];
    const idx = b.content.indexOf('\n\n{');
    return idx < 0 ? [] : [JSON.parse(b.content.slice(idx + 2)) as Record<string, unknown>];
  });
}

/** A fake client that returns the scripted messages in order and records every request. */
function scripted(steps: Step[]): {
  factory: (key: string) => CreateMessage;
  requests: Params[];
  keys: string[];
} {
  const requests: Params[] = [];
  const keys: string[] = [];
  let i = 0;
  const factory = (key: string): CreateMessage => {
    keys.push(key);
    return async (params: Params) => {
      // Snapshot: the loop mutates its messages array in place after the call.
      requests.push({ ...params, messages: [...params.messages] });
      const step = steps[Math.min(i, steps.length - 1)];
      i++;
      const m = step?.(params, lastToolResults(params));
      if (!m) throw new Error('script exhausted');
      return m;
    };
  };
  return { factory, requests, keys };
}

const env = { ANTHROPIC_API_KEY: 'sk-test' };

describe('passwerk chat', { timeout: 30000 }, () => {
  it('exits 3 without ANTHROPIC_API_KEY and never builds a client', async () => {
    let built = 0;
    const io = captureIo(
      {},
      {
        env: {},
        anthropic: () => {
          built++;
          return async () => message([], 'end_turn');
        },
      },
    );
    expect(await run(['chat', '-m', 'hallo'], io)).toBe(3);
    expect(io.err()).toMatch(/ANTHROPIC_API_KEY/);
    expect(built).toBe(0);
  });

  it('-m is required (exit 3)', async () => {
    const io = captureIo({}, { env, anthropic: scripted([]).factory });
    expect(await run(['chat'], io)).toBe(3);
  });

  it('runs one tool call, prints the trace and the final answer, exits 0', async () => {
    const script = scripted([
      () =>
        message(
          [
            text('Ich prüfe die Pflicht.'),
            call(
              'check_obligations',
              {
                batteryType: 'EV',
                role: 'manufacturer',
                placedOnMarketDate: '2027-06-01',
                lang: 'de',
              },
              1,
            ),
          ],
          'tool_use',
        ),
      (_p, results) => {
        expect(results[0]?.['verdict']).toBe('required');
        return message([text('Ein Batteriepass ist erforderlich.')], 'end_turn');
      },
    ]);
    const io = captureIo({}, { env, anthropic: script.factory });
    expect(await run(['chat', '-m', 'Brauche ich einen Batteriepass?', '--lang', 'de'], io)).toBe(
      0,
    );
    expect(script.keys).toEqual(['sk-test']);
    expect(io.out()).toContain('Ich prüfe die Pflicht.');
    expect(io.out()).toMatch(/→ check_obligations \{/);
    expect(io.out()).toMatch(/← check_obligations: required/);
    expect(io.out()).toContain('Ein Batteriepass ist erforderlich.');
    // The request carries the skill text as system prompt, every registry tool and the model.
    const first = script.requests[0] as Params;
    expect(first.model).toBe('claude-sonnet-5');
    expect(String(first.system)).toContain('passwerk');
    expect(first.tools?.map((t) => (t as Anthropic.Tool).name)).toContain('validate_passport');
    expect(first.messages[0]).toEqual({ role: 'user', content: 'Brauche ich einen Batteriepass?' });
    // Tool results are one user message with the text summary and the structured JSON.
    const second = script.requests[1] as Params;
    expect(second.messages).toHaveLength(3);
    const result = (second.messages[2]?.content as Anthropic.ToolResultBlockParam[])[0];
    expect(result?.type).toBe('tool_result');
    expect(result?.tool_use_id).toBe('toolu_1');
    expect(String(result?.content)).toMatch(/^required: .*\n\n\{/);
  });

  it('--max-turns bounds the loop (exit 2) and --model is passed through', async () => {
    const script = scripted([() => message([call('list_capabilities', {}, 1)], 'tool_use')]);
    const io = captureIo({}, { env, anthropic: script.factory });
    expect(
      await run(['chat', '-m', 'loop', '--max-turns', '2', '--model', 'claude-opus-5'], io),
    ).toBe(2);
    expect(script.requests).toHaveLength(2);
    expect(script.requests[0]?.model).toBe('claude-opus-5');
    expect(io.err()).toMatch(/2 turns/);
  });

  it('a failing tool call is returned as an error result and the loop continues', async () => {
    const script = scripted([
      () =>
        message([call('validate_passport', { draft: { draftId: 'drf_missing' } }, 1)], 'tool_use'),
      (p) => {
        const r = (p.messages.at(-1)?.content as Anthropic.ToolResultBlockParam[])[0];
        expect(r?.is_error).toBe(true);
        return message([text('done')], 'end_turn');
      },
    ]);
    const io = captureIo({}, { env, anthropic: script.factory });
    expect(await run(['chat', '-m', 'x'], io)).toBe(0);
    expect(io.out()).toMatch(/← validate_passport: error/);
  });

  it('definition of done: the Musterwerk chain applies the expected mappings and reports the gaps', async () => {
    const expected = JSON.parse(readFileSync(join(MUSTERWERK, 'expected.json'), 'utf8')) as {
      attributes: { attributeId: string; value: string; unit?: string; path?: string }[];
    };
    const applied: number[] = [];
    let gapOwners = 0;
    const script = scripted([
      () =>
        message(
          [
            call(
              'check_obligations',
              { batteryType: 'EV', role: 'manufacturer', placedOnMarketDate: '2027-06-01' },
              1,
            ),
          ],
          'tool_use',
        ),
      () => message([call('ingest_documents', { paths: ['docs'] }, 2)], 'tool_use'),
      (_p, r) =>
        message(
          [call('extract_facts', { bundle: { bundleId: r[0]?.['bundleId'] } }, 3)],
          'tool_use',
        ),
      (_p, r) =>
        message(
          [
            call(
              'suggest_mappings',
              { facts: { factSetId: r[0]?.['factSetId'] }, category: 'EV', minConfidence: 0.7 },
              4,
            ),
          ],
          'tool_use',
        ),
      (_p, r) => {
        const proposals = r[0]?.['proposals'] as MappingProposal[];
        const hits = expected.attributes.filter((e) =>
          proposals.some(
            (p) =>
              p.attributeId === e.attributeId &&
              p.value === e.value &&
              (e.path === undefined || p.path === e.path),
          ),
        );
        expect(hits.length).toBeGreaterThanOrEqual(32);
        return message(
          [
            call(
              'apply_mappings',
              {
                meta: { category: 'EV', passportId: 'urn:passwerk:demo:musterwerk' },
                mappings: proposals.map((p) => ({
                  attributeId: p.attributeId,
                  value: p.value,
                  ...(p.unit !== undefined ? { unit: p.unit } : {}),
                  ...(p.path !== undefined ? { path: p.path } : {}),
                  source: p.source,
                  confidence: p.confidence,
                })),
              },
              5,
            ),
          ],
          'tool_use',
        );
      },
      (_p, r) => {
        applied.push(r[0]?.['applied'] as number);
        return message(
          [call('validate_passport', { draft: { draftId: r[0]?.['draftId'] } }, 6)],
          'tool_use',
        );
      },
      (_p, r) => {
        expect(r[0]?.['verdict']).toBe('invalid');
        return message(
          [call('gap_report', { draft: { draftId: r[0]?.['draftId'] } }, 7)],
          'tool_use',
        );
      },
      (_p, r) => {
        gapOwners = (r[0]?.['byDataOwner'] as unknown[]).length;
        return message([text('Hier ist die Lückenliste.')], 'end_turn');
      },
    ]);
    const io = captureIo(musterwerkFiles(), { env, anthropic: script.factory });
    expect(
      await run(['chat', '-m', 'Erstelle einen Batteriepass aus docs', '--lang', 'de'], io),
    ).toBe(0);
    // Same floor as the server's Musterwerk chain (tools.ingest.test.ts): conflicting
    // candidates for one attribute are reported, not applied.
    expect(applied[0]).toBeGreaterThanOrEqual(25);
    expect(gapOwners).toBeGreaterThan(0);
    expect(io.out()).toMatch(/→ apply_mappings/);
    expect(io.out()).toMatch(/← gap_report: Pflichtangaben/);
  });

  it('definition of done: a golden draft imported through the loop validates as valid', async () => {
    const draft = JSON.parse(
      new TextDecoder().decode(sampleFiles()['/work/samples/ev-valid.json'] as Uint8Array),
    );
    const script = scripted([
      () => message([call('validate_passport', { draft }, 1)], 'tool_use'),
      (_p, r) => {
        expect(r[0]?.['verdict']).toBe('valid');
        return message([text('valid')], 'end_turn');
      },
    ]);
    const io = captureIo({}, { env, anthropic: script.factory });
    expect(await run(['chat', '-m', 'validate'], io)).toBe(0);
    expect(io.out()).toMatch(/← validate_passport: Verdict: valid\./);
  });

  it('--root restricts paths through the rooted file system', async () => {
    const roots: string[] = [];
    const script = scripted([
      () => message([call('ingest_documents', { paths: ['../secret.txt'] }, 1)], 'tool_use'),
      (p) => {
        const r = (p.messages.at(-1)?.content as Anthropic.ToolResultBlockParam[])[0];
        expect(String(r?.content)).toMatch(/outside the configured root/);
        return message([text('refused')], 'end_turn');
      },
    ]);
    const files = musterwerkFiles();
    const io = captureIo(files, {
      env,
      anthropic: script.factory,
      rootedFs: (root) => {
        roots.push(root);
        return captureIo(files).fs;
      },
    });
    expect(await run(['chat', '-m', 'x', '--root', '/work'], io)).toBe(0);
    expect(roots).toEqual(['/work']);
  });
});
