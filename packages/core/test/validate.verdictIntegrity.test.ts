import {
  applyMappings,
  emitAasJson,
  emitAasx,
  getSample,
  type PassportDraft,
  validate,
  validateSchema,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

/**
 * Regressions for issues #11 and #12: every entry point that hands out a verdict (validate,
 * emitAasJson, emitAasx) must agree, and an unresolved mapping conflict can never be `valid`.
 */

const ruleIds = (r: { findings: { ruleId: string }[] }) => r.findings.map((f) => f.ruleId).sort();

const evValid = (): PassportDraft => {
  const parsed = validateSchema(getSample('ev-valid')).draft;
  if (!parsed) throw new Error('ev-valid must parse');
  return structuredClone(parsed);
};

describe('#11 an unresolved mapping conflict is an L1 error in every verdict', () => {
  const conflicted = () =>
    applyMappings(evValid(), [
      { attributeId: 'batteryMass', value: '410', source: [{ file: 'other.csv' }] },
    ]);

  it('validate reports PW-L1-CONFLICT-UNRESOLVED on the attribute and is invalid', () => {
    const { draft, conflicts } = conflicted();
    expect(conflicts).toHaveLength(1);
    const r = validate(draft);
    expect(r.verdict).toBe('invalid');
    const f = r.findings.find((x) => x.ruleId === 'PW-L1-CONFLICT-UNRESOLVED');
    expect(f).toMatchObject({
      layer: 'L1',
      severity: 'error',
      attributeId: 'batteryMass',
      path: 'attributes.batteryMass',
    });
    expect(f?.message.de).toMatch(/batteryMass/);
    expect(f?.message.en).toMatch(/batteryMass/);
    expect(f?.message.de).not.toEqual(f?.message.en);
  });
  it('emitAasJson and emitAasx carry the same finding and the same invalid verdict', () => {
    const { draft } = conflicted();
    for (const r of [emitAasJson(draft), emitAasx(draft)]) {
      expect(r.verdict).toBe('invalid');
      expect(r.findings.map((f) => f.ruleId)).toContain('PW-L1-CONFLICT-UNRESOLVED');
      expect(r.output).toBeTruthy(); // fail-honest: the file is still returned for inspection
    }
  });
  it('an explicit override resolves the conflict and restores valid everywhere', () => {
    const { draft } = conflicted();
    const resolved = applyMappings(draft, [
      { attributeId: 'batteryMass', value: '410', override: true },
    ]);
    expect(resolved.draft.attributes['batteryMass']?.status).toBe('present');
    expect(validate(resolved.draft).verdict).toBe('valid');
    expect(emitAasJson(resolved.draft).verdict).toBe('valid');
    expect(emitAasx(resolved.draft).verdict).toBe('valid');
  });
  it('an identical repeated value is idempotent and stays valid', () => {
    const base = evValid();
    const current = base.attributes['batteryMass']?.value;
    const r = applyMappings(base, [
      { attributeId: 'batteryMass', value: current, source: [{ file: 'other.csv' }] },
    ]);
    expect(r.conflicts).toEqual([]);
    expect(validate(r.draft).verdict).toBe('valid');
  });
  it('a composite leaf conflict (#13) is reported the same way', () => {
    const r = applyMappings(evValid(), [
      { attributeId: 'manufacturerInformation', path: 'name.de', value: 'Andere GmbH' },
    ]);
    expect(r.conflicts).toHaveLength(1);
    const v = validate(r.draft);
    expect(v.verdict).toBe('invalid');
    expect(v.findings.find((f) => f.ruleId === 'PW-L1-CONFLICT-UNRESOLVED')?.attributeId).toBe(
      'manufacturerInformation',
    );
  });
});

describe('#12 export verdicts include L4 and agree with validate', () => {
  const withoutMeasurementTime = () => {
    const d = evValid();
    delete d.attributes['stateOfCharge']?.recordedAt;
    return d;
  };
  it('a missing measurement timestamp is invalid in validate and in both exporters', () => {
    const d = withoutMeasurementTime();
    const v = validate(d);
    expect(v.verdict).toBe('invalid');
    expect(ruleIds(v)).toContain('PW-PLAUS-011');
    for (const r of [emitAasJson(d), emitAasx(d)]) {
      expect(r.verdict).toBe('invalid');
      expect(ruleIds(r)).toEqual(ruleIds(v));
      expect(r.report.layers.L4).toEqual(v.layers.L4);
      expect(r.report.layers.L4.ran).toBe(true);
    }
  });
  it('asOf is honoured identically by validate and the exporters', () => {
    const d = evValid();
    const soc = d.attributes['stateOfCharge'];
    if (!soc) throw new Error('sample has no stateOfCharge');
    soc.recordedAt = '2030-01-01T00:00:00Z'; // after meta.createdAt: a future measurement
    const atCreation = validate(d);
    const later = validate(d, { asOf: '2031-01-01T00:00:00Z' });
    // The two clocks must produce different verdicts, otherwise this test proves nothing.
    expect(ruleIds(atCreation)).not.toEqual(ruleIds(later));
    expect(ruleIds(emitAasJson(d))).toEqual(ruleIds(atCreation));
    expect(ruleIds(emitAasx(d))).toEqual(ruleIds(atCreation));
    expect(ruleIds(emitAasJson(d, { asOf: '2031-01-01T00:00:00Z' }))).toEqual(ruleIds(later));
    expect(ruleIds(emitAasx(d, { asOf: '2031-01-01T00:00:00Z' }))).toEqual(ruleIds(later));
  });
  it('skipPlausibility is explicit and visible in the layer metadata', () => {
    const d = withoutMeasurementTime();
    const r = emitAasJson(d, { skipPlausibility: true });
    expect(r.report.layers.L4.ran).toBe(false);
    expect(ruleIds(r)).not.toContain('PW-PLAUS-011');
    expect(validate(d, { skipPlausibility: true }).layers.L4.ran).toBe(false);
  });
  it('every valid golden sample stays valid with L4 in the export verdict', () => {
    for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const) {
      const s = getSample(name);
      expect(emitAasJson(s).report.layers.L4, name).toEqual({ ran: true, errors: 0, warnings: 0 });
      expect(emitAasx(s).verdict, name).toBe('valid');
    }
  });
});
