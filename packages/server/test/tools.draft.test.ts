import {
  BROKEN_SAMPLE_NAMES,
  brokenSamples,
  canonicalJson,
  type Finding,
  gapReport,
  getSample,
  VALID_SAMPLE_NAMES,
  validate,
  validateSchema,
} from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, connect, TEST_CLOCK } from './harness.ts';

let session: Awaited<ReturnType<typeof connect>>;
beforeAll(async () => {
  session = await connect();
});
afterAll(() => session.close());

interface Validation {
  draftId: string;
  verdict: string;
  findings: Finding[];
}

describe('validate_passport', () => {
  it.each(VALID_SAMPLE_NAMES)('%s: reports core’s verdict and a draft id', async (name) => {
    const draft = getSample(name);
    const r = await call<Validation>(session.client, 'validate_passport', { draft });
    expect(r.isError).toBe(false);
    expect(r.structured.verdict).toBe(validate(draft).verdict);
    expect(r.structured.draftId).toMatch(/^drf_[0-9a-f]{16}$/);
    expect(r.text).toMatch(/^Verdict: /);
  });

  it.each(BROKEN_SAMPLE_NAMES)('%s: reports the expected findings', async (name) => {
    const { draft, expectedFindings } = brokenSamples[name];
    const r = await call<Validation>(session.client, 'validate_passport', { draft, lang: 'de' });
    expect(r.structured.verdict).toBe(validate(draft).verdict);
    expect(r.structured.verdict).not.toBe('valid');
    const ids = new Set(r.structured.findings.map((f) => f.ruleId));
    for (const id of expectedFindings) expect(ids, name).toContain(id);
    expect(r.text).toMatch(/^Ergebnis: (invalid|valid_with_warnings)/);
  });

  it('accepts the id it returned and gives a byte-identical result', async () => {
    const draft = getSample('industrial-valid');
    const a = await call<Validation>(session.client, 'validate_passport', { draft });
    const b = await call<Validation>(session.client, 'validate_passport', {
      draft: { draftId: a.structured.draftId },
    });
    expect(canonicalJson(b.structured)).toBe(canonicalJson(a.structured));
  });

  it('rejects an unknown id and a structurally invalid draft honestly', async () => {
    const unknown = await call<{ error: string }>(session.client, 'validate_passport', {
      draft: { draftId: 'drf_0000000000000000' },
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toMatch(/Unknown draft id/);
    const broken = await call<{ error: string; findings: Finding[] }>(
      session.client,
      'validate_passport',
      { draft: { meta: { category: 'EV' } } },
    );
    expect(broken.isError).toBe(true);
    expect(broken.structured.findings[0]?.layer).toBe('L1');
    expect(broken.text).toMatch(/structurally invalid/);
  });
});

describe('gap_report', () => {
  it('a valid sample reports core’s completeness', async () => {
    const draft = getSample('ev-valid');
    const r = await call<{
      draftId: string;
      completeness: { mandatory: { percent: string } };
      isNotLegalAdvice: true;
      sources: string[];
    }>(session.client, 'gap_report', { draft });
    expect(r.isError).toBe(false);
    const parsed = validateSchema(draft).draft;
    if (!parsed) throw new Error('sample must parse');
    const expected = gapReport(parsed, { report: validate(parsed) });
    expect(r.structured.completeness).toEqual(expected.completeness);
    expect(r.structured.isNotLegalAdvice).toBe(true);
    expect(r.structured.sources.length).toBeGreaterThan(0);
    expect(r.text).toMatch(
      new RegExp(`^Mandatory d+/d+ (${expected.completeness.mandatory.percent} %)`),
    );
  });

  it('a broken sample lists the finding that made the attribute a gap', async () => {
    const r = await call<{ items: { attributeId: string; findings: string[] }[] }>(
      session.client,
      'gap_report',
      { draft: brokenSamples['ev-missing-material-identifier'].draft, lang: 'de' },
    );
    expect(r.structured.items.some((i) => i.findings.length > 0)).toBe(true);
    expect(r.text).toMatch(/^Pflichtangaben/);
  });
});

describe('apply_mappings', () => {
  it('starts a draft from meta with the server clock and detects a conflict', async () => {
    const first = await call<{
      draftId: string;
      draft: { meta: { createdAt: string; category: string } };
      applied: number;
      conflicts: unknown[];
    }>(session.client, 'apply_mappings', {
      meta: { category: 'EV', passportId: 'urn:passwerk:test:1' },
      mappings: [{ attributeId: 'batteryIdentifier', value: 'X-1' }],
    });
    expect(first.isError).toBe(false);
    expect(first.structured.applied).toBe(1);
    expect(first.structured.draft.meta.createdAt).toBe(TEST_CLOCK);
    expect(first.structured.conflicts).toEqual([]);

    const second = await call<{ applied: number; conflicts: { attributeId: string }[] }>(
      session.client,
      'apply_mappings',
      {
        draft: { draftId: first.structured.draftId },
        mappings: [{ attributeId: 'batteryIdentifier', value: 'X-2' }],
      },
    );
    expect(second.structured.applied).toBe(0);
    expect(second.structured.conflicts).toHaveLength(1);
    expect(second.text).toContain('1 conflicts');
  });

  it('refuses both or neither of draft and meta', async () => {
    const none = await call(session.client, 'apply_mappings', { mappings: [] });
    expect(none.isError).toBe(true);
    const both = await call(session.client, 'apply_mappings', {
      draft: getSample('ev-valid'),
      meta: { category: 'EV', passportId: 'urn:x:1' },
      mappings: [],
    });
    expect(both.isError).toBe(true);
  });
});

describe('check_obligations', () => {
  it('EV manufacturer after the application date: required', async () => {
    const r = await call<{
      verdict: string;
      mandatoryAttributes: string[];
      isNotLegalAdvice: true;
      sources: string[];
      asOf: string;
    }>(session.client, 'check_obligations', {
      batteryType: 'EV',
      role: 'manufacturer',
      placedOnMarketDate: '2027-06-01',
    });
    expect(r.isError).toBe(false);
    expect(r.structured.verdict).toBe('required');
    expect(r.structured.mandatoryAttributes.length).toBeGreaterThan(10);
    expect(r.structured.isNotLegalAdvice).toBe(true);
    expect(r.structured.sources.length).toBeGreaterThan(0);
    expect(r.structured.asOf).toBe(TEST_CLOCK);
    expect(r.text).toMatch(/^required: /);
  });

  it('portable: not required; industrial without energy: insufficient input', async () => {
    const portable = await call<{ verdict: string }>(session.client, 'check_obligations', {
      batteryType: 'PORTABLE',
      role: 'importer',
      lang: 'de',
    });
    expect(portable.structured.verdict).toBe('not_required');
    expect(portable.text).toContain('Keine Rechtsberatung');
    const industrial = await call<{ verdict: string; missingInput: string[] }>(
      session.client,
      'check_obligations',
      { batteryType: 'INDUSTRIAL', role: 'manufacturer', placedOnMarketDate: '2027-06-01' },
    );
    expect(industrial.structured.verdict).toBe('insufficient_input');
    expect(industrial.structured.missingInput.length).toBeGreaterThan(0);
  });
});

describe('explain_attribute', () => {
  it('explains an attribute and a rule, and errors on an unknown id', async () => {
    const attr = await call<{ kind: string; legalRefs: string[]; isNotLegalAdvice: true }>(
      session.client,
      'explain_attribute',
      { id: 'batteryChemistry' },
    );
    expect(attr.structured.kind).toBe('attribute');
    expect(attr.structured.isNotLegalAdvice).toBe(true);
    expect(attr.text).toContain('batteryChemistry');

    const { plausibilityRules } = await import('@passwerk/rules');
    const ruleId = plausibilityRules[0]?.id ?? '';
    const rule = await call<{ kind: string }>(session.client, 'explain_attribute', {
      id: ruleId,
      lang: 'de',
    });
    expect(rule.structured.kind).toBe('rule');
    expect(rule.text).toContain(ruleId);

    const unknown = await call(session.client, 'explain_attribute', { id: 'nope' });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toMatch(/Unknown id "nope"/);
  });
});
