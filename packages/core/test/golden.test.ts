import {
  BROKEN_SAMPLE_NAMES,
  brokenSamples,
  emitAasJson,
  emitAasx,
  samples,
  VALID_SAMPLE_NAMES,
  validate,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('Phase 2 definition of done', () => {
  it('emit(sample) -> validate(output) is valid for every valid sample, for JSON and AASX', () => {
    for (const name of VALID_SAMPLE_NAMES) {
      expect(emitAasJson(samples[name]).verdict, `${name} json`).toBe('valid');
      expect(emitAasx(samples[name]).verdict, `${name} aasx`).toBe('valid');
      expect(validate(samples[name]).verdict, `${name} validate`).toBe('valid');
    }
  });
  it('every broken sample yields exactly its documented finding ids (as a set)', () => {
    for (const name of BROKEN_SAMPLE_NAMES) {
      const { draft, expectedFindings } = brokenSamples[name];
      const got = [...new Set(validate(draft).findings.map((f) => f.ruleId))].sort();
      expect(got, name).toEqual([...expectedFindings].sort());
    }
  });
  it('a document-only warning does not make the sample invalid', () => {
    const { draft } = brokenSamples['ev-document-without-classification'];
    expect(validate(draft).verdict).toBe('valid_with_warnings');
  });
});
