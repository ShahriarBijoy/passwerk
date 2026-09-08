import {
  BROKEN_SAMPLE_NAMES,
  brokenSamples,
  gapReport,
  getSample,
  validate,
  validateSchema,
} from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WORKBENCH_URI } from '../src/ui.ts';
import { call, connect, TEST_CLOCK } from './harness.ts';

let s: Awaited<ReturnType<typeof connect>>;
beforeAll(async () => {
  s = await connect();
});
afterAll(() => s.close());

interface ReviewOut {
  draftId?: string;
  draft?: unknown;
  factSetId?: string;
  facts?: unknown;
  report?: { verdict: string; findings: { ruleId: string }[] };
  gap?: { completeness: { mandatory: { percent: string } } };
  error?: string;
}

describe('review_passport (Phase 7b, ADR D-037)', () => {
  it('is listed with the workbench resource in _meta.ui and no other tool is', async () => {
    const { tools } = await s.client.listTools();
    const review = tools.find((t) => t.name === 'review_passport');
    expect(review?._meta).toEqual({
      ui: { resourceUri: WORKBENCH_URI, visibility: ['model', 'app'] },
    });
    expect(review?.annotations?.readOnlyHint).toBe(true);
    expect(review?.annotations?.idempotentHint).toBe(true);
    for (const t of tools) {
      if (t.name !== 'review_passport') expect(t._meta?.['ui'], t.name).toBeUndefined();
    }
  });

  it('returns draft, report and gap for an inline draft, and the same for its id', async () => {
    const draft = validateSchema(getSample('ev-valid')).draft;
    if (!draft) throw new Error('ev-valid must parse');
    const expected = gapReport(draft, {
      report: validate(draft, { asOf: TEST_CLOCK }),
      asOf: TEST_CLOCK,
    });
    const a = await call<ReviewOut>(s.client, 'review_passport', { draft });
    expect(a.isError).toBe(false);
    expect(a.structured.report?.verdict).toBe('valid');
    expect(a.structured.gap?.completeness.mandatory.percent).toBe(
      expected.completeness.mandatory.percent,
    );
    expect(a.structured.draft).toEqual(draft);
    expect(a.structured.draftId).toMatch(/^drf_/);
    expect(a.text).toContain('valid');
    const b = await call<ReviewOut>(s.client, 'review_passport', {
      draft: { draftId: a.structured.draftId },
    });
    expect(b.structured.draftId).toBe(a.structured.draftId);
    expect(b.structured.draft).toEqual(draft);
  });

  it('without input opens an empty workbench, in both languages', async () => {
    const en = await call<ReviewOut>(s.client, 'review_passport', {});
    expect(en.isError).toBe(false);
    expect(en.structured).toEqual({});
    expect(en.text).toMatch(/^Workbench opened/);
    const de = await call<ReviewOut>(s.client, 'review_passport', { lang: 'de' });
    expect(de.text).toMatch(/^Werkbank geöffnet/);
  });

  it('returns facts when given, stored under a factSetId', async () => {
    // A FactsRef is the FactSet itself (it has a `facts` key) or `{ factSetId }`.
    const facts = { facts: [], tables: [], documents: [] };
    const r = await call<ReviewOut>(s.client, 'review_passport', { facts });
    expect(r.isError).toBe(false);
    expect(r.structured.factSetId).toMatch(/^fct_/);
    expect(r.structured.facts).toEqual(facts);
    expect(r.structured.draftId).toBeUndefined();
    expect(r.text).toMatch(/0 facts/);
  });

  it('never answers valid for a broken sample', async () => {
    for (const name of BROKEN_SAMPLE_NAMES) {
      const { draft, expectedFindings } = brokenSamples[name];
      const r = await call<ReviewOut>(s.client, 'review_passport', { draft });
      if (r.isError) {
        expect(r.structured.error, name).toBeTruthy();
        continue;
      }
      expect(r.structured.report?.verdict, name).not.toBe('valid');
      const ids = new Set(r.structured.report?.findings.map((f) => f.ruleId));
      for (const id of expectedFindings) expect(ids.has(id), `${name}: ${id}`).toBe(true);
    }
  });
});
