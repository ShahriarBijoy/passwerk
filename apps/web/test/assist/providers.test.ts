import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_URL,
  buildCall,
  DEFAULT_MODELS,
  endpointLabel,
  readText,
} from '@/app/assist/providers.ts';
import type { Prompt } from '@/workflow/assist/prompt.ts';

const PROMPT: Prompt = { system: 'you map things', user: 'here are the facts' };

describe('the Anthropic envelope', () => {
  const call = () =>
    buildCall({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'sk-test' }, PROMPT);

  it('posts to the Messages endpoint', () => {
    expect(call().url).toBe(ANTHROPIC_URL);
  });

  it('sends the key as x-api-key, with the version and the browser-access header', () => {
    const { headers } = call();
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('never also sends the key as a bearer token', () => {
    expect(call().headers['authorization']).toBeUndefined();
    expect(call().headers['Authorization']).toBeUndefined();
  });

  it('carries the system prompt in its own field, not as a message', () => {
    const body = JSON.parse(call().body) as {
      system: string;
      messages: { role: string; content: string }[];
      model: string;
    };
    expect(body.system).toBe(PROMPT.system);
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.messages).toEqual([{ role: 'user', content: PROMPT.user }]);
  });

  it('reads the text out of the content blocks and ignores the rest', () => {
    const answer = {
      content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'text', text: '{"suggestions":[]}' },
      ],
    };
    expect(readText('anthropic', answer)).toBe('{"suggestions":[]}');
  });

  it('refuses an answer with no text block rather than inventing one', () => {
    expect(() => readText('anthropic', { content: [] })).toThrow();
    expect(() => readText('anthropic', { error: { message: 'nope' } })).toThrow(/nope/);
  });
});

describe('the OpenAI-compatible envelope', () => {
  const call = (baseUrl: string, apiKey = 'key') =>
    buildCall({ provider: 'openai-compatible', model: 'llama3', apiKey, baseUrl }, PROMPT);

  it('appends the chat completions path to the base URL', () => {
    expect(call('http://localhost:11434/v1').url).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
  });

  it('tolerates a trailing slash on the base URL', () => {
    expect(call('http://localhost:11434/v1/').url).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
  });

  it('sends the key as a bearer token', () => {
    expect(call('https://api.example.com/v1').headers['authorization']).toBe('Bearer key');
  });

  it('sends no authorization header at all for a local runner with no key', () => {
    expect(call('http://localhost:11434/v1', '').headers['authorization']).toBeUndefined();
  });

  it('sends the system prompt as the first message', () => {
    const body = JSON.parse(call('http://localhost:11434/v1').body) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages).toEqual([
      { role: 'system', content: PROMPT.system },
      { role: 'user', content: PROMPT.user },
    ]);
  });

  it('reads the first choice’s message content', () => {
    const answer = { choices: [{ message: { content: '{"critiques":[]}' } }] };
    expect(readText('openai-compatible', answer)).toBe('{"critiques":[]}');
  });

  it('rejects a base URL that is not http or https', () => {
    expect(() => call('javascript:alert(1)')).toThrow();
    expect(() => call('not a url')).toThrow();
    expect(() => call('')).toThrow();
  });
});

describe('defaults', () => {
  it('names a model for each provider', () => {
    expect(DEFAULT_MODELS.anthropic).toBe('claude-sonnet-5');
    expect(DEFAULT_MODELS['openai-compatible'].length).toBeGreaterThan(0);
  });
});

describe('endpointLabel', () => {
  it('names the host the request will actually reach', () => {
    expect(endpointLabel({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'x' })).toBe(
      'api.anthropic.com',
    );
    expect(
      endpointLabel({
        provider: 'openai-compatible',
        model: 'llama3',
        apiKey: '',
        baseUrl: 'http://localhost:11434/v1',
      }),
    ).toBe('localhost:11434');
  });

  it('echoes an unparseable base URL rather than pretending it knows the host', () => {
    expect(
      endpointLabel({
        provider: 'openai-compatible',
        model: 'llama3',
        apiKey: '',
        baseUrl: 'not a url',
      }),
    ).toBe('not a url');
  });
});
