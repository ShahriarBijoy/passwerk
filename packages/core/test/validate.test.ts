import { brokenSamples, samples, validate } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('validate (L1 -> emit -> L2 + L3)', () => {
  it('is valid for every valid sample and ran all layers', () => {
    for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const) {
      const r = validate(samples[name]);
      expect(r.findings, name).toEqual([]);
      expect(r.verdict, name).toBe('valid');
      expect(r.layers).toEqual({
        L1: { ran: true, errors: 0, warnings: 0 },
        L2: { ran: true, errors: 0, warnings: 0 },
        L3: { ran: true, errors: 0, warnings: 0 },
        L4: { ran: true, errors: 0, warnings: 0 },
      });
      expect(r.aasJson).toContain('"modelType": "Submodel"');
    }
  });
  it('stops after L1 on structural errors', () => {
    const r = validate({ meta: {}, attributes: {} });
    expect(r.verdict).toBe('invalid');
    expect(r.layers.L2.ran).toBe(false);
    expect(r.aasJson).toBeUndefined();
  });
  it('still runs L2 and L3 on value errors and reports both layers', () => {
    const r = validate(brokenSamples['ev-missing-material-identifier'].draft);
    const ids = r.findings.map((f) => f.ruleId);
    expect(ids).toContain('PW-L1-VALUE');
    expect(ids).toContain('PW-L3-MISSING');
    expect(r.layers.L3.ran).toBe(true);
    expect(r.verdict).toBe('invalid');
  });
});
