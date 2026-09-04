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

describe('PW-PLAUS-003 manufacturing date', () => {
  it('fires when manufacturing is after putting into service', () => {
    const draft = draftWith({
      manufacturingDate: { value: '2026-07-01' },
      dateOfPuttingIntoService: { value: '2026-06-15' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-003');
  });
  it('fires when manufacturing is in the future', () => {
    expect(ruleIds(draftWith({ manufacturingDate: { value: '2027-01-01' } }))).toContain(
      'PW-PLAUS-003',
    );
  });
  it('fires when manufacturing is before 2000', () => {
    expect(ruleIds(draftWith({ manufacturingDate: { value: '1998-05-01' } }))).toContain(
      'PW-PLAUS-003',
    );
  });
  it('is quiet for a plausible pair', () => {
    const draft = draftWith({
      manufacturingDate: { value: '2026-02-10' },
      dateOfPuttingIntoService: { value: '2026-06-15' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-003');
  });
});

describe('PW-PLAUS-004 battery mass', () => {
  it('warns for an EV battery of 3 kg', () => {
    expect(ruleIds(draftWith({ batteryMass: { value: '3' } }, 'EV'))).toContain('PW-PLAUS-004');
  });
  it('accepts 3.2 kg for an LMT battery', () => {
    expect(ruleIds(draftWith({ batteryMass: { value: '3.2' } }, 'LMT'))).not.toContain(
      'PW-PLAUS-004',
    );
  });
});

describe('PW-PLAUS-005 industrial 2 kWh threshold', () => {
  it('fires when capacity times voltage is not above 2 kWh', () => {
    const draft = draftWith(
      { ratedCapacity: { value: '10' }, nominalVoltage: { value: '48' } },
      'INDUSTRIAL_GT_2KWH',
    );
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-005');
    expect(f?.message.en).toContain('0.48 kWh');
  });
  it('is quiet above the threshold and for other categories', () => {
    const big = draftWith(
      { ratedCapacity: { value: '280' }, nominalVoltage: { value: '800' } },
      'INDUSTRIAL_GT_2KWH',
    );
    expect(ruleIds(big)).not.toContain('PW-PLAUS-005');
    const ev = draftWith({ ratedCapacity: { value: '10' }, nominalVoltage: { value: '48' } }, 'EV');
    expect(ruleIds(ev)).not.toContain('PW-PLAUS-005');
  });
});

describe('PW-PLAUS-006 battery status vocabulary', () => {
  it('accepts the five values case- and hyphen-insensitively', () => {
    for (const v of ['Original', 'repurposed', 'RE-USED', 'reused', 'Remanufactured', 'waste']) {
      expect(ruleIds(draftWith({ batteryStatus: { value: v } })), v).not.toContain('PW-PLAUS-006');
    }
  });
  it('fires for anything else', () => {
    expect(ruleIds(draftWith({ batteryStatus: { value: 'refurbished' } }))).toContain(
      'PW-PLAUS-006',
    );
  });
});

describe('PW-PLAUS-007 category agreement', () => {
  it('fires when the attribute disagrees with the draft category', () => {
    expect(ruleIds(draftWith({ batteryCategory: { value: 'LMT' } }, 'EV'))).toContain(
      'PW-PLAUS-007',
    );
  });
  it('is quiet when they agree', () => {
    expect(ruleIds(draftWith({ batteryCategory: { value: 'EV' } }, 'EV'))).not.toContain(
      'PW-PLAUS-007',
    );
  });
});

describe('PW-PLAUS-008 passport identifier', () => {
  it('fires for a non-https identifier', () => {
    const draft = PassportDraft.parse({
      meta: { ...META, passportId: 'urn:uuid:not-resolvable' },
      attributes: {
        batteryPassportIdentifier: {
          value: 'urn:uuid:not-resolvable',
          status: 'present',
          source: [],
        },
      },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-008');
  });
  it('is quiet for an https identifier', () => {
    expect(
      ruleIds(draftWith({ batteryPassportIdentifier: { value: 'https://example.org/bp/1' } })),
    ).not.toContain('PW-PLAUS-008');
  });
});
