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

  it('passes a composite leaf through: core exposes no leaf schema', () => {
    expect(validateValue('batteryChemistry', 'clearName', 'NMC')).toEqual({ ok: true });
  });

  it('passes an unknown attribute through', () => {
    expect(validateValue('notAnAttribute', undefined, 'x')).toEqual({ ok: true });
  });
});
