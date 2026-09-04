import { BATTERY_TYPES, checkObligations } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const AS_OF = '2027-03-01';

describe('checkObligations', () => {
  it('requires a passport for an EV battery of any size', () => {
    const r = checkObligations({ batteryType: 'EV', role: 'manufacturer', asOf: AS_OF });
    expect(r.verdict).toBe('required');
    expect(r.category).toBe('EV');
    expect(r.mandatoryAttributes.length).toBe(47);
    expect(r.sources).toContain('BR Article 77(1), Annex XIII');
  });

  it('requires a passport for an LMT battery', () => {
    const r = checkObligations({ batteryType: 'LMT', role: 'importer', asOf: AS_OF });
    expect(r.verdict).toBe('required');
    expect(r.category).toBe('LMT');
  });

  it('requires a passport for an industrial battery above 2 kWh', () => {
    const r = checkObligations({
      batteryType: 'INDUSTRIAL',
      energyKwh: '220',
      role: 'manufacturer',
      asOf: AS_OF,
    });
    expect(r.verdict).toBe('required');
    expect(r.category).toBe('INDUSTRIAL_GT_2KWH');
  });

  it('does not require one for an industrial battery of exactly 2 kWh', () => {
    const r = checkObligations({
      batteryType: 'INDUSTRIAL',
      energyKwh: '2',
      role: 'manufacturer',
      asOf: AS_OF,
    });
    expect(r.verdict).toBe('not_required');
    expect(r.category).toBeNull();
  });

  it('declines to answer for an industrial battery of unknown size', () => {
    const r = checkObligations({ batteryType: 'INDUSTRIAL', role: 'manufacturer', asOf: AS_OF });
    expect(r.verdict).toBe('insufficient_input');
    expect(r.missingInput).toContain('energyKwh');
    expect(r.isNotLegalAdvice).toBe(true);
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it('declines to answer for malformed or non-finite energy values', () => {
    for (const energyKwh of ['abc', 'NaN', 'Infinity']) {
      const r = checkObligations({
        batteryType: 'INDUSTRIAL',
        energyKwh,
        role: 'manufacturer',
        asOf: AS_OF,
      });
      expect(r.verdict, energyKwh).toBe('insufficient_input');
      expect(r.missingInput, energyKwh).toContain('energyKwh');
    }
  });

  it('treats stationary storage as industrial and says so', () => {
    const r = checkObligations({
      batteryType: 'STATIONARY_BATTERY_ENERGY_STORAGE',
      energyKwh: '500',
      role: 'manufacturer',
      asOf: AS_OF,
    });
    expect(r.verdict).toBe('required');
    expect(r.category).toBe('INDUSTRIAL_GT_2KWH');
    expect(r.reason.en.toLowerCase()).toContain('industrial');
    expect(r.reason.de.length).toBeGreaterThan(0);
  });

  it('does not require one for portable or SLI batteries', () => {
    for (const batteryType of ['PORTABLE', 'SLI', 'OTHER'] as const) {
      const r = checkObligations({ batteryType, role: 'manufacturer', asOf: AS_OF });
      expect(r.verdict, batteryType).toBe('not_required');
      expect(r.mandatoryAttributes, batteryType).toEqual([]);
    }
  });

  it('does not require one for a portable battery even with no date at all', () => {
    const r = checkObligations({ batteryType: 'PORTABLE', role: 'manufacturer' });
    expect(r.verdict).toBe('not_required');
  });

  it('does not require one before the passport obligation starts', () => {
    const r = checkObligations({
      batteryType: 'EV',
      role: 'manufacturer',
      placedOnMarketDate: '2026-11-01',
    });
    expect(r.verdict).toBe('not_required');
    expect(r.category).toBeNull();
    expect(r.mandatoryAttributes).toEqual([]);
    expect(r.reason.en).toContain('2027-02-18');
  });

  it('gates on placedOnMarketDate even when a later asOf is also given', () => {
    const r = checkObligations({
      batteryType: 'EV',
      role: 'manufacturer',
      placedOnMarketDate: '2026-11-01',
      asOf: '2027-03-01',
    });
    expect(r.verdict).toBe('not_required');
  });

  it('declines to answer without any date', () => {
    const r = checkObligations({ batteryType: 'EV', role: 'manufacturer' });
    expect(r.verdict).toBe('insufficient_input');
    expect(r.missingInput).toContain('placedOnMarketDate');
  });

  it('returns the timeline with in-effect flags and verify flags intact', () => {
    const r = checkObligations({ batteryType: 'EV', role: 'manufacturer', asOf: AS_OF });
    const passportEvent = r.timeline.find((e) => e.id === 'battery-passport');
    expect(passportEvent?.inEffect).toBe(true);
    expect(passportEvent?.legalRef).toBe('BR Article 77(1), Annex XIII');
    const future = r.timeline.find((e) => e.date > AS_OF);
    expect(future?.inEffect).toBe(false);
    expect(r.timeline.some((e) => e.verify === true)).toBe(true);
  });

  it('gives DE/EN role guidance and never claims to be legal advice', () => {
    const r = checkObligations({ batteryType: 'EV', role: 'distributor', asOf: AS_OF });
    expect(r.roleGuidance.de.length).toBeGreaterThan(0);
    expect(r.roleGuidance.en.length).toBeGreaterThan(0);
    expect(r.isNotLegalAdvice).toBe(true);
  });

  it('answers for every battery type without throwing', () => {
    for (const batteryType of BATTERY_TYPES) {
      expect(() =>
        checkObligations({ batteryType, energyKwh: '10', role: 'other', asOf: AS_OF }),
      ).not.toThrow();
    }
  });
});
