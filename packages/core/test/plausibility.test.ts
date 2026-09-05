import {
  PassportDraft,
  type PassportDraftInput,
  samples,
  validate,
  validatePlausibility,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

/**
 * A deep copy of a sample with some attribute values replaced. The sample file itself stays
 * untouched, and a typo in an attribute id fails loudly here rather than silently producing
 * a draft that no rule looks at.
 */
function sampleWith(name: 'lmt-valid', values: Record<string, string>): PassportDraftInput {
  const draft = structuredClone(samples[name]);
  for (const [id, value] of Object.entries(values)) {
    const field = draft.attributes[id];
    if (field === undefined) throw new Error(`sample ${name} has no attribute ${id}`);
    field.value = value;
  }
  return draft;
}

describe('L4 plumbing', () => {
  it('reports four layers and stays valid for the valid samples', () => {
    const r = validate(samples['lmt-valid']);
    expect(r.layers.L4).toEqual({ ran: true, errors: 0, warnings: 0 });
  });

  it('an L4 error drives the overall verdict to invalid', () => {
    // Without this, deleting `...l4` from the spread in validate/index.ts leaves the whole
    // suite green: L4 would compute findings that never reach the caller's verdict.
    const r = validate(sampleWith('lmt-valid', { batteryStatus: 'refurbished' }));
    expect(r.layers.L4).toEqual({ ran: true, errors: 1, warnings: 0 });
    expect(r.findings.map((f) => f.ruleId)).toContain('PW-PLAUS-006');
    expect(r.verdict).toBe('invalid');
  });

  it('an L4 warning drives the overall verdict to valid_with_warnings', () => {
    const r = validate(
      sampleWith('lmt-valid', {
        initialRoundTripEnergyEfficiency: '88',
        roundTripEnergyEfficiencyAt50PercentCycleLife: '92',
      }),
    );
    expect(r.layers.L4.errors).toBe(0);
    expect(r.layers.L4.warnings).toBe(1);
    expect(r.findings.map((f) => f.ruleId)).toContain('PW-PLAUS-021');
    expect(r.verdict).toBe('valid_with_warnings');
  });

  it('does not run L4 when asked to skip it', () => {
    const r = validate(samples['lmt-valid'], { skipPlausibility: true });
    expect(r.layers.L4.ran).toBe(false);
  });

  it('returns no findings for a draft with no attributes', () => {
    const draft = PassportDraft.parse({
      meta: {
        schemaVersion: '1.0',
        category: 'EV',
        createdAt: '2026-09-03T12:00:00Z',
        passportId: 'https://example.org/bp/1',
      },
      attributes: {},
    });
    expect(validatePlausibility(draft).findings).toEqual([]);
  });
});
