import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractFacts,
  type FactSet,
  ingest,
  type MappingProposal,
  suggestMappings,
} from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { ASSIST_THRESHOLD, buildRequest } from '@/workflow/assist/request.ts';
import type { Decision, DecisionKey } from '@/workflow/state.ts';

const FIX = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'core',
  'test',
  'fixtures',
  'musterwerk',
);
const NAMES = ['lieferantenerklaerung.pdf', 'stueckliste.xlsx', 'datasheet-en.csv'];

let facts: FactSet = { facts: [], tables: [], documents: [] };
let proposals: MappingProposal[] = [];

beforeAll(async () => {
  const bundle = await ingest(
    NAMES.map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(FIX, name))) })),
  );
  facts = extractFacts(bundle);
  proposals = suggestMappings(facts, { category: 'INDUSTRIAL_GT_2KWH' });
}, 60_000);

const build = (decisions: Record<DecisionKey, Decision> = {}) =>
  buildRequest({
    category: 'INDUSTRIAL_GT_2KWH',
    language: 'de',
    facts,
    proposals,
    decisions,
  });

describe('buildRequest', () => {
  it('asks only about facts the deterministic matcher left below the threshold', () => {
    const confident = new Set(
      proposals.filter((p) => p.confidence >= ASSIST_THRESHOLD).map((p) => p.factId),
    );
    expect(confident.size).toBeGreaterThan(0); // guard: the fixtures do produce confident hits
    const { request, refs } = build();
    expect(request.facts.length).toBeGreaterThan(0);
    for (const f of request.facts) expect(confident.has(refs.facts[f.id] ?? '')).toBe(false);
  });

  it('sends an opaque token for each fact, never core’s id', () => {
    // A core fact id is `${document}#${page}:${ordinal}` — it carries the file name. The model
    // gets a per-run token instead and the real id stays in `refs`, which is never serialised.
    const { request, refs } = build();
    for (const f of request.facts) {
      expect(f.id).toMatch(/^f\d+$/);
      expect(refs.facts[f.id]).toBeDefined();
    }
    expect(new Set(request.facts.map((f) => f.id)).size).toBe(request.facts.length);
  });

  it('leaves out a fact the reviewer has already decided', () => {
    const first = build().request.facts[0];
    if (!first) throw new Error('expected at least one fact to ask about');
    const factId = build().refs.facts[first.id] ?? '';
    const decisions: Record<DecisionKey, Decision> = {
      nominalVoltage: { kind: 'manual', attributeId: 'nominalVoltage', factId, value: '400' },
    };
    const { request, refs } = build(decisions);
    expect(request.facts.map((f) => refs.facts[f.id])).not.toContain(factId);
  });

  it('offers the confident proposals for a second opinion', () => {
    const expected = proposals.filter((p) => p.confidence >= ASSIST_THRESHOLD).length;
    const { request, refs } = build();
    expect(request.proposals).toHaveLength(expected);
    for (const p of request.proposals) {
      expect(p.id).toMatch(/^p\d+$/);
      expect(refs.proposals[p.id]).toBeDefined();
    }
  });

  it('never sends a file name, a page, a cell or any other provenance', () => {
    const json = JSON.stringify(build().request);
    for (const name of NAMES) expect(json).not.toContain(name);
    for (const key of ['"source"', '"file"', '"page"', '"cell"', '"row"', '"sheet"']) {
      expect(json).not.toContain(key);
    }
  });

  it('sends nothing that is not part of the declared payload', () => {
    const { request } = build();
    expect(Object.keys(request).sort()).toEqual([
      'catalogue',
      'category',
      'facts',
      'language',
      'proposals',
    ]);
    const factKeys = new Set(request.facts.flatMap((f) => Object.keys(f)));
    expect([...factKeys].sort()).toEqual(['id', 'label', 'lang', 'unit', 'value']);
    const proposalKeys = new Set(request.proposals.flatMap((p) => Object.keys(p)));
    expect([...proposalKeys].sort()).toEqual([
      'attributeId',
      'confidence',
      'id',
      'path',
      'unit',
      'value',
    ]);
  });

  it('is deterministic: the same inputs build the same request', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it('has nothing to ask when every fact is decided', () => {
    const decisions: Record<DecisionKey, Decision> = Object.fromEntries(
      facts.facts.map((f, i) => [
        `a${i}`,
        { kind: 'manual', attributeId: 'nominalVoltage', factId: f.id, value: '1' } as Decision,
      ]),
    );
    expect(build(decisions).request.facts).toEqual([]);
  });
});
