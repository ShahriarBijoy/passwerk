import { normalizeLabel, tokens } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('normalizeLabel', () => {
  it.each([
    ['Nennkapazität:', 'nennkapazitaet'],
    ['Batteriemasse [kg]', 'batteriemasse'],
    ['Kobalt rec. %', 'kobalt rec'],
    ['Rated capacity (Ah)', 'rated capacity'],
    ['Anteil des recycelten Kobalts', 'anteil recycelten kobalts'],
    ['  Herstellungs-Datum ', 'herstellungs datum'],
    ['Straße', 'strasse'],
  ])('%s -> %s', (input, key) => {
    expect(normalizeLabel(input)).toBe(key);
  });
  it('tokens', () => {
    expect(tokens('anteil recycelten kobalts')).toEqual(['anteil', 'recycelten', 'kobalts']);
  });
});
