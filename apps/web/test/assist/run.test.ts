import type { Fact, FactSet } from '@passwerk/core';
import { describe, expect, it, vi } from 'vitest';
import { runAssist } from '@/workflow/assist/run.ts';
import type { AssistClient, AssistRequest } from '@/workflow/assist/types.ts';

const fact = (id: string, label: string, value: string, unit?: string): Fact => ({
  id,
  label,
  labelKey: label.toLowerCase(),
  raw: value,
  value,
  kind: 'decimal',
  ...(unit === undefined ? {} : { unit }),
  lang: 'de',
  shape: 'kv',
  source: { file: 'geheim.pdf', page: 1 },
});

const FACTS: FactSet = {
  facts: [fact('geheim.pdf#1:1', 'Klemmenspannung', '400', 'V')],
  tables: [],
  documents: [],
};

const input = (client: AssistClient) => ({
  client,
  category: 'INDUSTRIAL_GT_2KWH' as const,
  language: 'de' as const,
  facts: FACTS,
  proposals: [],
  decisions: {},
});

describe('runAssist', () => {
  it('builds the request, calls the model, and returns the guarded result', async () => {
    const client = vi.fn(
      async () =>
        '{"suggestions":[{"fact":"f0","attribute":"nominalVoltage","reason":"Klemmenspannung ist die Nennspannung"}]}',
    );
    const result = await runAssist(input(client), new AbortController().signal);

    expect(result.suggestions).toEqual([
      {
        factId: 'geheim.pdf#1:1',
        attributeId: 'nominalVoltage',
        reason: 'Klemmenspannung ist die Nennspannung',
      },
    ]);
    expect(result.discards).toEqual([]);
  });

  it('hands the client a request with no provenance in it', async () => {
    let seen: AssistRequest | undefined;
    const client = vi.fn(async (request: AssistRequest) => {
      seen = request;
      return '{}';
    });
    await runAssist(input(client), new AbortController().signal);
    expect(JSON.stringify(seen)).not.toContain('geheim.pdf');
  });

  it('passes the abort signal to the client', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const client: AssistClient = async (_request, signal) => {
      seen = signal;
      return '{}';
    };
    await runAssist(input(client), controller.signal);
    expect(seen).toBe(controller.signal);
  });

  it('turns a hallucinated attribute into a discard, not a suggestion', async () => {
    const client = vi.fn(
      async () => '{"suggestions":[{"fact":"f0","attribute":"nominalVoltageXL","reason":"x"}]}',
    );
    const result = await runAssist(input(client), new AbortController().signal);
    expect(result.suggestions).toEqual([]);
    expect(result.discards.map((d) => d.reason)).toEqual(['unknown-attribute']);
  });

  it('lets the client’s failure through unchanged', async () => {
    const client = vi.fn(async () => {
      throw new Error('api.anthropic.com answered 401');
    });
    await expect(runAssist(input(client), new AbortController().signal)).rejects.toThrow(/401/);
  });

  it('does not call the model when there is nothing to ask about', async () => {
    const client = vi.fn(async () => '{}');
    const empty = {
      ...input(client),
      facts: { facts: [], tables: [], documents: [] } as FactSet,
    };
    const result = await runAssist(empty, new AbortController().signal);
    expect(client).not.toHaveBeenCalled();
    expect(result).toEqual({ suggestions: [], critiques: [], discards: [] });
  });
});
