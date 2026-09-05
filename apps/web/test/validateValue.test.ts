import { describe, expect, it } from 'vitest';
import { validateValue } from '@/workflow/validateValue.ts';

describe('validateValue', () => {
  it('accepts a decimal string for a decimal attribute', () => {
    expect(validateValue('ratedCapacity', undefined, '94.5')).toEqual({ ok: true });
  });

  it('rejects a comma decimal, naming the attribute in both languages', () => {
    const r = validateValue('ratedCapacity', undefined, '94,5');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected a failure');
    expect(r.message.de).toContain('Nennkapazität');
    expect(r.message.en).toContain('Rated capacity');
    expect(r.message.en).toContain('12.5');
  });

  it('rejects an empty value', () => {
    expect(validateValue('ratedCapacity', undefined, '').ok).toBe(false);
  });

  it('rejects a raw string for a whole composite, in both languages', () => {
    const r = validateValue('manufacturerInformation', undefined, 'Musterwerk GmbH');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected a failure');
    expect(r.message.de).toContain('feldweise');
    expect(r.message.en).toContain('field by field');
  });

  it('rejects a raw string for an array composite too', () => {
    expect(validateValue('criticalRawMaterials', undefined, 'lithium').ok).toBe(false);
  });

  it('accepts a nested composite leaf that its schema allows', () => {
    expect(validateValue('manufacturerInformation', 'name.de', 'Musterwerk')).toEqual({ ok: true });
    expect(validateValue('manufacturerInformation', 'address.cityTown', 'Aachen')).toEqual({
      ok: true,
    });
    expect(validateValue('batteryChemistry', 'clearName', 'NMC')).toEqual({ ok: true });
  });

  it('rejects a leaf value the leaf schema refuses', () => {
    const r = validateValue('initialInternalResistance', 'cellOhm', 'ziemlich viel');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected a failure');
    expect(r.message.en).toContain('decimal');
    expect(validateValue('manufacturerInformation', 'name.de', '').ok).toBe(false);
  });

  it('rejects a path the composite does not declare, and one that stops on a sub-object', () => {
    expect(validateValue('manufacturerInformation', 'nope', 'x').ok).toBe(false);
    expect(validateValue('manufacturerInformation', 'address', 'Aachen').ok).toBe(false);
    expect(validateValue('criticalRawMaterials', '0.name', 'Lithium').ok).toBe(false);
  });

  it('rejects an unparsable measured-at timestamp, and accepts a real one', () => {
    expect(validateValue('stateOfCharge', undefined, '80', '2026-09-04T10:00')).toEqual({
      ok: true,
    });
    const r = validateValue('stateOfCharge', undefined, '80', 'gestern');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected a failure');
    expect(r.message.de).toBe('Ungültiger Zeitpunkt');
    expect(r.message.en).toBe('Invalid timestamp');
  });

  it('passes an unknown attribute through', () => {
    expect(validateValue('notAnAttribute', undefined, 'x')).toEqual({ ok: true });
  });
});
