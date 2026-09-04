import { canonicalUnit, convertUnit, splitValueUnit, unitFromLabel } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('units', () => {
  it.each([
    ['94,5 Ah', '94,5', 'Ah'],
    ['12,5%', '12,5', '%'],
    ['12,5 %', '12,5', '%'],
    ['0,5C', '0,5', 'C'],
    ['-20 °C', '-20', '°C'],
    ['33.600 Wh', '33.600', 'Wh'],
    ['96 Monate', '96', 'Monate'],
    ['3000 Zyklen', '3000', 'Zyklen'],
    ['1,1 %/Monat', '1,1', '%/Monat'],
    ['13.746,43 EUR', '13.746,43', 'EUR'],
    ['MW-EV-2026-000123', '', undefined],
  ])('splits %s', (raw, number, unitRaw) => {
    const r = splitValueUnit(raw);
    expect(r.number).toBe(number);
    expect(r.unitRaw).toBe(unitRaw);
  });
  it.each([
    ['Ah', 'Ah', undefined],
    ['mAh', 'Ah', '0.001'],
    ['Wh', 'kWh', '0.001'],
    ['MWh', 'kWh', '1000'],
    ['g', 'kg', '0.001'],
    ['t', 'kg', '1000'],
    ['kW', 'W', '1000'],
    ['°C', 'degC', undefined],
    ['℃', 'degC', undefined],
    ['degC', 'degC', undefined],
    ['mΩ', 'Ohm', '0.001'],
    ['Ω', 'Ohm', undefined],
    ['Ohm', 'Ohm', undefined],
    ['%', '%', undefined],
    ['%/Monat', '%/month', undefined],
    ['%/month', '%/month', undefined],
    ['Zyklen', 'cycles', undefined],
    ['cycles', 'cycles', undefined],
    ['Monate', 'months', undefined],
    ['Jahre', 'years', undefined],
    ['years', 'years', undefined],
    ['h', 'min', '60'],
    ['min', 'min', undefined],
    ['kg CO2e/kWh', 'kgCO2e/kWh', undefined],
    ['kg CO2-Äq./kWh', 'kgCO2e/kWh', undefined],
    ['t CO2e', 'tCO2e', undefined],
    ['C', 'C', undefined],
    ['W/Wh', 'W/Wh', undefined],
    ['V', 'V', undefined],
  ])('%s -> %s', (raw, unit, factor) => {
    expect(canonicalUnit(raw)).toEqual(factor ? { unit, factor } : { unit });
  });
  it('unknown units stay unknown', () => {
    expect(canonicalUnit('EUR')).toBeUndefined();
    expect(canonicalUnit('Tage')).toBeUndefined();
  });
  it('converts with decimal.js, no floats', () => {
    expect(convertUnit('33600', '0.001')).toBe('33.6');
    expect(convertUnit('0.1', '0.001')).toBe('0.0001');
    expect(convertUnit('2.5', '1000')).toBe('2500');
  });
  it('reads a unit out of a label suffix', () => {
    expect(unitFromLabel('Batteriemasse [kg]')).toBe('kg');
    expect(unitFromLabel('Nennenergie [kWh]')).toBe('kWh');
    expect(unitFromLabel('Kobalt rec. %')).toBe('%');
    expect(unitFromLabel('Rated capacity (Ah)')).toBe('Ah');
    expect(unitFromLabel('Hersteller')).toBeUndefined();
  });
});
