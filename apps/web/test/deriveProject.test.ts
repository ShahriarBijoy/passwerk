import { checkObligations } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { deriveCarrier } from '@/workflow/derive/carrier.ts';
import { memoLast } from '@/workflow/derive/memo.ts';
import { deriveProject } from '@/workflow/derive/project.ts';
import { defaultProject, type Project } from '@/workflow/project.ts';

const EARLY = '2026-09-07T12:00:00Z';
// After the 2027-02-18 obligation start (packages/core/src/obligations/check.ts), so EV reads "required".
const AT = '2027-09-07T12:00:00Z';
const base = defaultProject('urn:passwerk:draft:1', AT);

describe('memoLast', () => {
  it('reuses the result while every argument is identical', () => {
    let calls = 0;
    const f = memoLast((a: object, b: string) => {
      calls += 1;
      return { a, b };
    });
    const o = {};
    const r1 = f(o, 'x');
    expect(f(o, 'x')).toBe(r1);
    expect(calls).toBe(1);
    f(o, 'y');
    expect(calls).toBe(2);
  });
});

describe('deriveCarrier', () => {
  it('renders an SVG for an https identifier', () => {
    const c = deriveCarrier('https://p.example/1');
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.svg.startsWith('<svg')).toBe(true);
      expect(c.payload).toBe('https://p.example/1');
    }
  });
  it('reports the carrier reason for a urn', () => {
    const c = deriveCarrier('urn:passwerk:draft:1');
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.message.de).toBeTruthy();
      expect(c.message.en).toBeTruthy();
    }
  });
});

describe('deriveProject', () => {
  it('EV manufacturer: required, category EV, meta with the draft urn, no QR', () => {
    const d = deriveProject(base, AT);
    expect(d.obligations.verdict).toBe('required');
    expect(d.category).toBe('EV');
    expect(d.meta).toEqual({
      schemaVersion: '1.0',
      category: 'EV',
      passportId: 'urn:passwerk:draft:1',
      createdAt: AT,
    });
    expect(d.carrier.ok).toBe(false);
    expect(d.obligations).toEqual(
      checkObligations({ batteryType: 'EV', role: 'manufacturer', asOf: AT }),
    );
  });
  it('industrial without energy: insufficient input, no category, no meta', () => {
    const d = deriveProject({ ...base, batteryType: 'INDUSTRIAL' }, AT);
    expect(d.obligations.verdict).toBe('insufficient_input');
    expect(d.obligations.missingInput).toEqual(['energyKwh']);
    expect(d.category).toBeNull();
    expect(d.meta).toBeNull();
  });
  it('industrial 1.5 kWh: not required; a manual category makes a voluntary passport', () => {
    const p: Project = { ...base, batteryType: 'INDUSTRIAL', energyKwh: '1.5' };
    expect(deriveProject(p, AT).obligations.verdict).toBe('not_required');
    expect(deriveProject(p, AT).category).toBeNull();
    const v = deriveProject({ ...p, manualCategory: 'INDUSTRIAL_GT_2KWH' }, AT);
    expect(v.category).toBe('INDUSTRIAL_GT_2KWH');
    expect(v.meta?.category).toBe('INDUSTRIAL_GT_2KWH');
  });
  it('industrial 3 kWh: required and derived category wins over a manual one', () => {
    const d = deriveProject(
      { ...base, batteryType: 'INDUSTRIAL', energyKwh: '3', manualCategory: 'EV' },
      AT,
    );
    expect(d.obligations.verdict).toBe('required');
    expect(d.category).toBe('INDUSTRIAL_GT_2KWH');
  });
  it('portable: not required, category only by hand', () => {
    expect(deriveProject({ ...base, batteryType: 'PORTABLE' }, AT).category).toBeNull();
    expect(
      deriveProject({ ...base, batteryType: 'PORTABLE', manualCategory: 'LMT' }, AT).category,
    ).toBe('LMT');
  });
  it('GS1 identifier: meta carries the link and the QR is rendered', () => {
    const d = deriveProject(
      {
        ...base,
        identifier: {
          mode: 'gs1',
          resolverBase: 'https://id.example.com',
          gtin: '96385074',
          serial: 'SN-1',
        },
      },
      AT,
    );
    expect(d.identifier.ok).toBe(true);
    expect(d.meta?.passportId).toBe('https://id.example.com/01/00000096385074/21/SN-1');
    expect(d.carrier.ok).toBe(true);
  });
  it('a broken identifier yields no meta and the carrier shows its message', () => {
    const d = deriveProject({ ...base, identifier: { mode: 'https', uri: 'nope' } }, AT);
    expect(d.identifier.ok).toBe(false);
    expect(d.meta).toBeNull();
    expect(d.carrier.ok).toBe(false);
  });
  it('is memoised on the project identity and asOf', () => {
    const p = { ...base };
    expect(deriveProject(p, AT)).toBe(deriveProject(p, AT));
    expect(deriveProject({ ...p }, AT)).not.toBe(deriveProject(p, AT));
  });
  it('before the obligation date: verdict not_required, but category and meta exist', () => {
    const d = deriveProject(base, EARLY);
    expect(d.obligations.verdict).toBe('not_required');
    expect(d.category).toBe('EV');
    expect(d.meta).not.toBeNull();
    expect(d.meta?.category).toBe('EV');
    expect(d.obligations.reason.en).toContain('2027-02-18');
  });
});
