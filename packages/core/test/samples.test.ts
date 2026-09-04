import {
  BROKEN_SAMPLE_NAMES,
  brokenSamples,
  samples,
  VALID_SAMPLE_NAMES,
  validate,
  validateSchema,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('golden samples', () => {
  it('valid samples pass L1 without findings', () => {
    for (const name of VALID_SAMPLE_NAMES) {
      const r = validateSchema(samples[name]);
      expect(r.findings, name).toEqual([]);
    }
  });
  it('broken samples declare their expected findings and produce them where L1 applies', () => {
    for (const name of BROKEN_SAMPLE_NAMES) {
      const { draft, expectedFindings } = brokenSamples[name];
      expect(expectedFindings.length, name).toBeGreaterThan(0);
      const l1 = validateSchema(draft).findings.map((f) => f.ruleId);
      for (const id of expectedFindings.filter((e) => e.startsWith('PW-L1-'))) {
        expect(l1, name).toContain(id);
      }
    }
  });
  it('every sample is marked fictional', () => {
    const all = [...Object.values(samples), ...Object.values(brokenSamples).map((b) => b.draft)];
    for (const s of all) expect((s as { $comment?: string }).$comment).toMatch(/fictional/i);
  });
  it('broken samples produce the PW-PLAUS findings they declare', () => {
    for (const name of BROKEN_SAMPLE_NAMES) {
      const { draft, expectedFindings } = brokenSamples[name];
      const produced = validate(draft).findings.map((f) => f.ruleId);
      for (const id of expectedFindings.filter((e) => e.startsWith('PW-PLAUS-'))) {
        expect(produced, name).toContain(id);
      }
    }
  });
});
