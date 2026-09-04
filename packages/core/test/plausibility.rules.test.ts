import { PassportDraft, validatePlausibility } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const META = {
  schemaVersion: '1.0' as const,
  category: 'EV' as const,
  createdAt: '2026-09-03T12:00:00Z',
  passportId: 'https://example.org/bp/1',
};

/** Build a draft holding just the attributes a rule needs. */
export function draftWith(
  attributes: Record<string, { value: unknown; recordedAt?: string }>,
  category: 'EV' | 'LMT' | 'INDUSTRIAL_GT_2KWH' = 'EV',
): PassportDraft {
  return PassportDraft.parse({
    meta: { ...META, category },
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([id, f]) => [
        id,
        {
          value: f.value,
          status: 'present',
          source: [],
          ...(f.recordedAt ? { recordedAt: f.recordedAt } : {}),
        },
      ]),
    ),
  });
}

export function ruleIds(draft: PassportDraft, asOf?: string): string[] {
  return validatePlausibility(draft, asOf ? { asOf } : {}).findings.map((f) => f.ruleId);
}

describe('PW-PLAUS-001 percentage band', () => {
  it('fires when a listed percentage is above 100', () => {
    const findings = validatePlausibility(draftWith({ stateOfCharge: { value: '140' } })).findings;
    const f = findings.find((x) => x.ruleId === 'PW-PLAUS-001');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
    expect(f?.attributeId).toBe('stateOfCharge');
    expect(f?.message.en).toContain('stateOfCharge');
    expect(f?.message.en).toContain('140');
    expect(f?.message.de).not.toContain('{');
    expect(f?.fixHint?.de).toBeTruthy();
  });

  it('is quiet for a value inside the band', () => {
    expect(ruleIds(draftWith({ stateOfCharge: { value: '70' } }))).not.toContain('PW-PLAUS-001');
  });

  it('is hidden when L1 already rejected the value', () => {
    const draft = draftWith({ stateOfCharge: { value: '140' } });
    const l1 = [
      {
        layer: 'L1' as const,
        ruleId: 'PW-L1-VALUE',
        severity: 'error' as const,
        path: 'attributes.stateOfCharge.value',
        attributeId: 'stateOfCharge',
        message: { de: 'x', en: 'x' },
      },
    ];
    expect(validatePlausibility(draft, { l1Findings: l1 }).findings).toEqual([]);
  });
});

describe('PW-PLAUS-002 voltage ordering', () => {
  it('fires when the three voltages are not ascending', () => {
    const draft = draftWith({
      minimumVoltage: { value: '400' },
      nominalVoltage: { value: '300' },
      maximumVoltage: { value: '450' },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-002');
    expect(f?.message.en).toBe(
      'Minimum 400 V, nominal 300 V and maximum 450 V are not in ascending order.',
    );
    expect(f?.legalRef).toBe('BR Annex XIII 1(h)');
  });

  it('is quiet when ordered, and when a voltage is missing', () => {
    const ok = draftWith({
      minimumVoltage: { value: '300' },
      nominalVoltage: { value: '400' },
      maximumVoltage: { value: '450' },
    });
    expect(ruleIds(ok)).not.toContain('PW-PLAUS-002');
    expect(ruleIds(draftWith({ nominalVoltage: { value: '400' } }))).not.toContain('PW-PLAUS-002');
  });
});
