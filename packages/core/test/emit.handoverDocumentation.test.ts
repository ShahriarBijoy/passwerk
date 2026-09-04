import {
  PassportDraft as Draft,
  emitAasJson,
  emitHandoverDocumentation,
  getSample,
  type PassportDraft,
  resolveIds,
  validate,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const draft = Draft.parse(getSample('ev-valid'));
const ids = resolveIds(draft);
const CLASS = {
  classId: '02-04',
  className: { en: 'Certificates, declarations' },
  system: 'VDI2770:2020',
};

describe('emitHandoverDocumentation (IDTA 02035-2)', () => {
  it('emits one Document per classified DocumentRef with ids, version and file', () => {
    const sm = emitHandoverDocumentation(draft, ids)!;
    expect(sm.idShort).toBe('HandoverDocumentation');
    const json = JSON.parse(emitAasJson(draft).output) as {
      submodels: { idShort: string; submodelElements: unknown[] }[];
    };
    const part2 = json.submodels.find((s) => s.idShort === 'HandoverDocumentation')!;
    const documents = (part2.submodelElements[0] as { value: unknown[] }).value;
    expect(documents.length).toBeGreaterThan(0);
    expect(JSON.stringify(part2)).toContain('"02-04"');
    expect(JSON.stringify(part2)).toContain('DoC-MW-EV-2026-01');
  });
  it('returns null when no document carries a classification', () => {
    const stripped: PassportDraft = structuredClone(draft);
    for (const f of Object.values(stripped.attributes))
      if (Array.isArray(f?.value))
        for (const d of f.value as { classification?: unknown }[]) delete d.classification;
    expect(emitHandoverDocumentation(stripped, ids)).toBeNull();
  });
  it('a document without uri or fileName is emitted without DigitalFiles and L3 reports the gap', () => {
    const d: PassportDraft = structuredClone(draft);
    d.attributes['testReportsProvingCompliance'] = {
      status: 'present',
      source: [],
      value: [{ id: 'TR-1', classification: CLASS }],
    };
    const report = validate(d);
    expect(
      report.findings.some(
        (f) => f.ruleId === 'PW-L3-MISSING' && /DigitalFiles/.test(f.message.en),
      ),
    ).toBe(true);
  });
  it('the valid samples stay valid with part 2 emitted', () => {
    for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const)
      expect(validate(getSample(name)).verdict, name).toBe('valid');
  });
});
