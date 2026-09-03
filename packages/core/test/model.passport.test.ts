import {
  ATTRIBUTE_IDS,
  COMPOSITE_SCHEMAS,
  isAttributeId,
  PassportDraft,
  presentValue,
} from '@passwerk/core';
import { attributes } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const meta = {
  schemaVersion: '1.0',
  category: 'EV',
  createdAt: '2026-09-03T12:00:00Z',
  passportId: 'https://passport.example.test/battery/0001',
} as const;

describe('attribute ids', () => {
  it('mirror the knowledge base', () => {
    expect(ATTRIBUTE_IDS).toEqual(attributes.map((a) => a.id));
    expect(isAttributeId('manufacturingDate')).toBe(true);
    expect(isAttributeId('nope')).toBe(false);
  });
});

describe('PassportDraft', () => {
  it('parses a minimal draft and applies field defaults', () => {
    const r = PassportDraft.safeParse({
      meta,
      attributes: { manufacturingDate: { value: '2026-03-01', status: 'present' } },
    });
    expect(r.success).toBe(true);
    expect(r.data?.attributes['manufacturingDate']).toEqual({
      value: '2026-03-01',
      status: 'present',
      source: [],
    });
  });
  it('rejects unknown attribute ids and bad meta', () => {
    expect(
      PassportDraft.safeParse({ meta, attributes: { nope: { status: 'missing' } } }).success,
    ).toBe(false);
    expect(
      PassportDraft.safeParse({ meta: { ...meta, schemaVersion: '2.0' }, attributes: {} }).success,
    ).toBe(false);
    expect(
      PassportDraft.safeParse({ meta: { ...meta, passportId: 'not a uri' }, attributes: {} })
        .success,
    ).toBe(false);
    expect(
      PassportDraft.safeParse({ meta: { ...meta, createdAt: '2026-09-03' }, attributes: {} })
        .success,
    ).toBe(false);
  });
  it('presentValue returns values only for present or conflict fields', () => {
    const d = PassportDraft.parse({
      meta,
      attributes: {
        manufacturingDate: { value: '2026-03-01', status: 'present' },
        batteryIdentifier: { status: 'missing' },
      },
    });
    expect(presentValue<string>(d, 'manufacturingDate')).toBe('2026-03-01');
    expect(presentValue(d, 'batteryIdentifier')).toBeUndefined();
    expect(presentValue(d, 'operatorIdentifier')).toBeUndefined();
  });
});

describe('composites', () => {
  it('manufacturerInformation', () => {
    const S = COMPOSITE_SCHEMAS['manufacturerInformation'];
    expect(
      S?.safeParse({ name: { de: 'Musterwerk Batteriesysteme GmbH' }, identifier: 'DE-MW-001' })
        .success,
    ).toBe(true);
    expect(S?.safeParse({ name: {}, identifier: 'x' }).success).toBe(false);
  });
  it('battery materials require name and identifier; mass is a decimal string', () => {
    const S = COMPOSITE_SCHEMAS['criticalRawMaterials'];
    expect(
      S?.safeParse([{ name: 'Lithium', identifier: '7439-93-2', massKg: '2.35' }]).success,
    ).toBe(true);
    expect(S?.safeParse([{ name: 'Lithium', identifier: '7439-93-2', massKg: 2.35 }]).success).toBe(
      false,
    );
    expect(S?.safeParse([{ name: 'Lithium' }]).success).toBe(false);
  });
  it('hazardous substances', () => {
    const S = COMPOSITE_SCHEMAS['hazardousSubstances'];
    expect(
      S?.safeParse([
        {
          name: 'Lithium hexafluorophosphate',
          identifier: '21324-40-3',
          concentrationPercent: '0.12',
          impacts: ['H302'],
        },
      ]).success,
    ).toBe(true);
    expect(
      S?.safeParse([{ name: 'x', identifier: 'y', concentrationPercent: '101' }]).success,
    ).toBe(false);
  });
  it('carbon footprint general information needs one calculation method', () => {
    const S = COMPOSITE_SCHEMAS['carbonFootprintGeneralInformation'];
    expect(S?.safeParse({ calculationMethods: ['ISO 14067:2018'] }).success).toBe(true);
    expect(S?.safeParse({ calculationMethods: [] }).success).toBe(false);
  });
});
