import { PassportDraft, samples, validate, validatePlausibility } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('L4 plumbing', () => {
  it('reports four layers and stays valid for the valid samples', () => {
    const r = validate(samples['lmt-valid']);
    expect(r.layers.L4).toEqual({ ran: true, errors: 0, warnings: 0 });
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
