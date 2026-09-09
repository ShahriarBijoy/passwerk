import { describe, expect, it, vi } from 'vitest';
import { makeAssistClient } from '@/app/assist/client.ts';
import { ANTHROPIC_URL } from '@/app/assist/providers.ts';
import type { AssistRequest } from '@/workflow/assist/types.ts';

const REQUEST: AssistRequest = {
  category: 'INDUSTRIAL_GT_2KWH',
  language: 'de',
  catalogue: [],
  facts: [],
  proposals: [],
};

const ok = (payload: unknown) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'text/json' } });

const anthropicAnswer = { content: [{ type: 'text', text: '{"suggestions":[]}' }] };

const config = { provider: 'anthropic' as const, model: 'claude-sonnet-5', apiKey: 'sk-test' };

describe('makeAssistClient', () => {
  it('posts the envelope to the provider and returns the model’s text', async () => {
    const fetchImpl = vi.fn(async () => ok(anthropicAnswer));
    const client = makeAssistClient(config, fetchImpl);
    const text = await client(REQUEST, new AbortController().signal);

    expect(text).toBe('{"suggestions":[]}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
  });

  it('passes the caller’s abort signal through to fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => ok(anthropicAnswer));
    await makeAssistClient(config, fetchImpl)(REQUEST, controller.signal);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('reports the status and the provider’s own words when the call is refused', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 }),
    );
    await expect(
      makeAssistClient(config, fetchImpl)(REQUEST, new AbortController().signal),
    ).rejects.toThrow(/401[\s\S]*invalid x-api-key/);
  });

  it('names the endpoint when the browser blocks the request outright', async () => {
    // A CORS refusal or an unreachable local runner arrives as a bare TypeScript "Failed to
    // fetch", which tells the reviewer nothing about which endpoint failed.
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      makeAssistClient(config, fetchImpl)(REQUEST, new AbortController().signal),
    ).rejects.toThrow(/api\.anthropic\.com/);
  });

  it('lets an abort surface as an abort, not as a failed endpoint', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    await expect(
      makeAssistClient(config, fetchImpl)(REQUEST, new AbortController().signal),
    ).rejects.toThrow(/aborted/i);
  });

  it('refuses a body that is not JSON', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('<html>gateway error</html>', { status: 200 }),
    );
    await expect(
      makeAssistClient(config, fetchImpl)(REQUEST, new AbortController().signal),
    ).rejects.toThrow();
  });
});
