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

describe('PW-PLAUS-009 CAS numbers', () => {
  it('accepts a valid CAS number and rejects a bad check digit', () => {
    const ok = draftWith({
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: '7440-48-4' }] },
    });
    expect(ruleIds(ok)).not.toContain('PW-PLAUS-009');
    const bad = draftWith({
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: '7440-48-9' }] },
    });
    expect(ruleIds(bad)).toContain('PW-PLAUS-009');
  });
  it('rejects a trade name', () => {
    const draft = draftWith({
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: 'CoSulfate-A' }] },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-009');
  });
});

describe('PW-PLAUS-010 recycled shares per material', () => {
  it('fires when pre and post consumer exceed 100 % together', () => {
    const draft = draftWith({
      recycledCobaltPreConsumer: { value: '60' },
      recycledCobaltPostConsumer: { value: '55' },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-010');
    expect(f?.message.en).toContain('115');
    expect(f?.message.en).toContain('Cobalt');
  });
  it('is quiet at exactly 100 % and when one side is missing', () => {
    const at100 = draftWith({
      recycledCobaltPreConsumer: { value: '40' },
      recycledCobaltPostConsumer: { value: '60' },
    });
    expect(ruleIds(at100)).not.toContain('PW-PLAUS-010');
    expect(ruleIds(draftWith({ recycledCobaltPreConsumer: { value: '90' } }))).not.toContain(
      'PW-PLAUS-010',
    );
  });
});

describe('PW-PLAUS-011 LastUpdate on dynamic values', () => {
  it('fires when a dynamic value has no recordedAt', () => {
    expect(ruleIds(draftWith({ numberOfFullCycles: { value: '412' } }))).toContain('PW-PLAUS-011');
  });
  it('fires when recordedAt is in the future', () => {
    const draft = draftWith({
      numberOfFullCycles: { value: '412', recordedAt: '2027-01-01T00:00:00Z' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-011');
  });
  it('is quiet with a past recordedAt', () => {
    const draft = draftWith({
      numberOfFullCycles: { value: '412', recordedAt: '2026-08-30T18:30:00Z' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-011');
  });
});

describe('PW-PLAUS-012 not-displayed data points (D-023)', () => {
  it('warns for an optional template element the Commission says not to display', () => {
    // capacityThresholdForExhaustion is ZeroToOne in IDTA 02035-4 and not_displayed for
    // INDUSTRIAL_GT_2KWH, so the supplier can leave it out.
    const draft = draftWith(
      { capacityThresholdForExhaustion: { value: '80' } },
      'INDUSTRIAL_GT_2KWH',
    );
    expect(ruleIds(draft)).toContain('PW-PLAUS-012');
  });
  it('stays quiet when the template makes the element mandatory', () => {
    // remainingCapacity is not_displayed for EV but its IDTA 02035-5 block is cardinality One:
    // omitting it would make L3 fail, so the supplier has no choice and we do not nag.
    const draft = draftWith(
      { remainingCapacity: { value: '194', recordedAt: '2026-08-30T18:30:00Z' } },
      'EV',
    );
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-012');
  });
});

describe('PW-PLAUS-013 is not a validation rule', () => {
  it('is absent from the catalogue and the registry', async () => {
    const { getRule } = await import('@passwerk/rules');
    const { CHECKS } = await import('@passwerk/core');
    expect(getRule('PW-PLAUS-013')).toBeUndefined();
    expect(CHECKS['PW-PLAUS-013']).toBeUndefined();
  });
});

describe('PW-PLAUS-014 internal resistance unit', () => {
  it('fires for a pack resistance of 85 Ohm', () => {
    const draft = draftWith({
      initialInternalResistance: { value: { cellOhm: '0.0012', packOhm: '85' } },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-014');
  });
  it('is quiet for milliohm-scale values', () => {
    const draft = draftWith({
      initialInternalResistance: { value: { cellOhm: '0.0012', packOhm: '0.085' } },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-014');
  });
});

describe('PW-PLAUS-015 idle temperature range', () => {
  it('fires when the lower boundary is not below the upper', () => {
    const draft = draftWith({
      temperatureRangeIdleLowerBoundary: { value: '45' },
      temperatureRangeIdleUpperBoundary: { value: '-20' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-015');
  });
  it('is quiet for a well-ordered range', () => {
    const draft = draftWith({
      temperatureRangeIdleLowerBoundary: { value: '-20' },
      temperatureRangeIdleUpperBoundary: { value: '45' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-015');
  });
});

describe('PW-PLAUS-016 energy coherence', () => {
  it('fires when the declared energy is off by more than 20 %', () => {
    // 195 Ah x 400 V = 78 kWh; 7.5 kWh is a factor of ten out.
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      nominalVoltage: { value: '400' },
      certifiedUsableBatteryEnergy: { value: '7.5' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-016');
  });
  it('accepts a realistic usable fraction', () => {
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      nominalVoltage: { value: '400' },
      certifiedUsableBatteryEnergy: { value: '75' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-016');
  });
});

describe('PW-PLAUS-017 carbon footprint shares', () => {
  it('fires when the four shares do not add up to 100', () => {
    const draft = draftWith({
      carbonFootprintShareRawMaterials: { value: '40' },
      carbonFootprintShareManufacturing: { value: '30' },
      carbonFootprintShareDistribution: { value: '5' },
      carbonFootprintShareEndOfLife: { value: '5' },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-017');
    expect(f?.message.en).toContain('80');
    expect(f?.legalRef).toBeUndefined();
  });
  it('is quiet within a percentage point, and when fewer than three shares are present', () => {
    const ok = draftWith({
      carbonFootprintShareRawMaterials: { value: '54.5' },
      carbonFootprintShareManufacturing: { value: '35' },
      carbonFootprintShareDistribution: { value: '8' },
      carbonFootprintShareEndOfLife: { value: '2.2' },
    });
    expect(ruleIds(ok)).not.toContain('PW-PLAUS-017');
    const sparse = draftWith({
      carbonFootprintShareRawMaterials: { value: '54.5' },
      carbonFootprintShareManufacturing: { value: '35' },
    });
    expect(ruleIds(sparse)).not.toContain('PW-PLAUS-017');
  });
});

describe('PW-PLAUS-018 material mass sum', () => {
  it('fires when the materials outweigh the battery', () => {
    const draft = draftWith({
      batteryMass: { value: '10' },
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: '7440-48-4', massKg: '8' }] },
      electrodeAndElectrolyteMaterials: {
        value: [{ name: 'Graphite', identifier: '7782-42-5', massKg: '5' }],
      },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-018');
    expect(f?.severity).toBe('error');
    expect(f?.message.en).toContain('13');
  });
  it('is quiet when the materials fit', () => {
    const draft = draftWith({
      batteryMass: { value: '412.5' },
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: '7440-48-4', massKg: '12' }] },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-018');
  });
});

describe('PW-PLAUS-019 hazardous substance concentrations', () => {
  it('fires above 100 % in total', () => {
    const draft = draftWith({
      hazardousSubstances: {
        value: [
          { name: 'Nickel', identifier: '7440-02-0', concentrationPercent: '70' },
          { name: 'Cobalt', identifier: '7440-48-4', concentrationPercent: '45' },
        ],
      },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-019');
  });
  it('is quiet for a realistic set', () => {
    const draft = draftWith({
      hazardousSubstances: {
        value: [{ name: 'Nickel', identifier: '7440-02-0', concentrationPercent: '12.5' }],
      },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-019');
  });
});

describe('PW-PLAUS-020 remaining versus original', () => {
  it('fires once per violated pair', () => {
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      remainingCapacity: { value: '210', recordedAt: '2026-08-30T18:30:00Z' },
      initialRoundTripEnergyEfficiency: { value: '92' },
      remainingRoundTripEnergyEfficiency: { value: '95', recordedAt: '2026-08-30T18:30:00Z' },
    });
    const hits = validatePlausibility(draft).findings.filter((x) => x.ruleId === 'PW-PLAUS-020');
    expect(hits).toHaveLength(2);
    expect(hits[0]?.message.en).toContain('remainingCapacity');
  });
  it('is quiet when every remaining value is at or below its original', () => {
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      remainingCapacity: { value: '194', recordedAt: '2026-08-30T18:30:00Z' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-020');
  });
});

describe('PW-PLAUS-021 efficiency over cycle life', () => {
  it('fires when the later value is higher', () => {
    const draft = draftWith({
      initialRoundTripEnergyEfficiency: { value: '88' },
      roundTripEnergyEfficiencyAt50PercentCycleLife: { value: '92' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-021');
  });
  it('is quiet when efficiency degrades', () => {
    const draft = draftWith({
      initialRoundTripEnergyEfficiency: { value: '92' },
      roundTripEnergyEfficiencyAt50PercentCycleLife: { value: '88' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-021');
  });
});

describe('PW-PLAUS-022 capacity fade coherence', () => {
  it('fires when the declared fade does not match the capacities', () => {
    // (1 - 150/200) x 100 = 25 %, not 2 %.
    const draft = draftWith({
      ratedCapacity: { value: '200' },
      remainingCapacity: { value: '150', recordedAt: '2026-08-30T18:30:00Z' },
      capacityFade: { value: '2' },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-022');
    expect(f?.message.en).toContain('25');
  });
  it('is quiet within a percentage point', () => {
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      remainingCapacity: { value: '194', recordedAt: '2026-08-30T18:30:00Z' },
      capacityFade: { value: '0' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-022');
  });
});

describe('PW-PLAUS-023 cycle count', () => {
  it('fires above the expected lifetime', () => {
    const draft = draftWith({
      numberOfFullCycles: { value: '4200', recordedAt: '2026-08-30T18:30:00Z' },
      expectedLifetimeCycles: { value: '3000' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-023');
  });
  it('is quiet below it', () => {
    const draft = draftWith({
      numberOfFullCycles: { value: '412', recordedAt: '2026-08-30T18:30:00Z' },
      expectedLifetimeCycles: { value: '3000' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-023');
  });
});

describe('PW-PLAUS-024 carbon footprint companions', () => {
  it('fires once per missing companion', () => {
    const draft = draftWith({ carbonFootprintPerFunctionalUnit: { value: '61.2' } });
    const hits = validatePlausibility(draft).findings.filter((x) => x.ruleId === 'PW-PLAUS-024');
    expect(hits).toHaveLength(2);
  });
  it('is quiet when both companions are present', () => {
    const draft = draftWith({
      carbonFootprintPerFunctionalUnit: { value: '61.2' },
      carbonFootprintGeneralInformation: { value: { calculationMethods: ['PEFCR 2023'] } },
      carbonFootprintStudyLink: {
        value: [{ id: 'cf-study', title: 'LCA study', uri: 'https://example.org/lca.pdf' }],
      },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-024');
  });
});

describe('PW-PLAUS-025 extreme temperature time', () => {
  it('fires when the times exceed the age since putting into service', () => {
    // In service since 2026-08-31, asOf 2026-09-03: about 4320 minutes.
    const draft = draftWith({
      dateOfPuttingIntoService: { value: '2026-08-31' },
      timeInExtremeHighTemperature: { value: '50000', recordedAt: '2026-09-01T00:00:00Z' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-025');
  });
  it('is quiet for a plausible exposure and when the service date is unknown', () => {
    const ok = draftWith({
      dateOfPuttingIntoService: { value: '2026-01-01' },
      timeInExtremeHighTemperature: { value: '120', recordedAt: '2026-09-01T00:00:00Z' },
    });
    expect(ruleIds(ok)).not.toContain('PW-PLAUS-025');
    const noDate = draftWith({
      timeInExtremeHighTemperature: { value: '50000', recordedAt: '2026-09-01T00:00:00Z' },
    });
    expect(ruleIds(noDate)).not.toContain('PW-PLAUS-025');
  });
});
