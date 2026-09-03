import { COMPOSITE_SCHEMAS, computeVerdict, validateSchema } from '@passwerk/core';
import { attributes } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const meta = {
  schemaVersion: '1.0',
  category: 'EV',
  createdAt: '2026-09-03T12:00:00Z',
  passportId: 'https://passport.example.test/battery/0001',
};
const ids = (r: { findings: { ruleId: string }[] }) => r.findings.map((f) => f.ruleId);

describe('L1 validateSchema', () => {
  it('accepts a well-formed draft and returns the parsed draft', () => {
    const r = validateSchema({
      meta,
      attributes: { manufacturingDate: { value: '2026-03-01', status: 'present' } },
    });
    expect(r.findings).toEqual([]);
    expect(r.draft?.meta.category).toBe('EV');
  });
  it('reports structural issues as PW-L1-SCHEMA with a path', () => {
    const r = validateSchema({ meta: { ...meta, category: 'TRUCK' }, attributes: {} });
    expect(ids(r)).toContain('PW-L1-SCHEMA');
    expect(r.findings[0]?.path).toBe('meta.category');
    expect(r.draft).toBeUndefined();
  });
  it('reports unknown attribute ids', () => {
    const r = validateSchema({ meta, attributes: { nope: { status: 'missing' } } });
    expect(ids(r)).toContain('PW-L1-UNKNOWN-ATTRIBUTE');
    expect(r.findings.find((f) => f.ruleId === 'PW-L1-UNKNOWN-ATTRIBUTE')?.path).toBe(
      'attributes.nope',
    );
  });
  it('checks values against the valueKind (date, decimal, composite)', () => {
    const r = validateSchema({
      meta,
      attributes: {
        manufacturingDate: { value: '01.03.2026', status: 'present' },
        carbonFootprintPerFunctionalUnit: { value: '61,2', unit: 'kgCO2e/kWh', status: 'present' },
        criticalRawMaterials: { value: [{ name: 'Lithium' }], status: 'present' },
      },
    });
    const bad = r.findings.filter((f) => f.ruleId === 'PW-L1-VALUE');
    expect(bad.map((f) => f.attributeId).sort()).toEqual([
      'carbonFootprintPerFunctionalUnit',
      'criticalRawMaterials',
      'manufacturingDate',
    ]);
    expect(bad[0]?.message.de.length).toBeGreaterThan(5);
    expect(bad[0]?.message.en.length).toBeGreaterThan(5);
    expect(bad[0]?.severity).toBe('error');
  });
  it('flags a passport id mismatch', () => {
    const r = validateSchema({
      meta,
      attributes: {
        batteryPassportIdentifier: { value: 'https://other.example.test/1', status: 'present' },
      },
    });
    expect(ids(r)).toContain('PW-L1-PASSPORT-ID-MISMATCH');
  });
  it('warns on unassigned substance impacts', () => {
    const r = validateSchema({
      meta,
      attributes: {
        substanceImpacts: { value: 'H302 Harmful if swallowed', status: 'present' },
        hazardousSubstances: {
          value: [{ name: 'LiPF6', identifier: '21324-40-3' }],
          status: 'present',
        },
      },
    });
    expect(ids(r)).toEqual(['PW-L1-IMPACT-UNASSIGNED']);
    expect(r.findings[0]?.severity).toBe('warning');
  });
  it('every composite attribute in the knowledge base has an explicit shape', () => {
    const unmodelled = attributes
      .filter((a) => a.valueKind === 'composite' && !COMPOSITE_SCHEMAS[a.id])
      .map((a) => a.id);
    expect(unmodelled).toEqual([]);
  });
});

describe('computeVerdict', () => {
  const f = (severity: 'error' | 'warning') => ({
    layer: 'L1' as const,
    ruleId: 'x',
    severity,
    path: '',
    message: { de: 'x', en: 'x' },
  });
  it('is invalid on any error, valid_with_warnings on warnings only, else valid', () => {
    expect(computeVerdict([])).toBe('valid');
    expect(computeVerdict([f('warning')])).toBe('valid_with_warnings');
    expect(computeVerdict([f('warning'), f('error')])).toBe('invalid');
  });
});
