import { isDecimalString, valueSchemaFor, valueSchemaForKind } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const ok = (kind: Parameters<typeof valueSchemaForKind>[0], v: unknown) =>
  valueSchemaForKind(kind).safeParse(v).success;

describe('value schemas per valueKind', () => {
  it('decimal strings', () => {
    expect(isDecimalString('61.2')).toBe(true);
    expect(isDecimalString('-0.5')).toBe(true);
    expect(isDecimalString('61,2')).toBe(false);
    expect(isDecimalString('1e3')).toBe(false);
    expect(ok('decimal', '12.5')).toBe(true);
    expect(ok('decimal', 12.5)).toBe(false);
  });
  it('percentage is 0..100', () => {
    expect(ok('percentage', '100')).toBe(true);
    expect(ok('percentage', '100.01')).toBe(false);
  });
  it('integer', () => {
    expect(ok('integer', '42')).toBe(true);
    expect(ok('integer', '4.2')).toBe(false);
  });
  it('date and dateTime', () => {
    expect(ok('date', '2026-03-01')).toBe(true);
    expect(ok('date', '01.03.2026')).toBe(false);
    expect(ok('dateTime', '2026-03-01T10:00:00Z')).toBe(true);
    expect(ok('dateTime', '2026-03-01')).toBe(false);
  });
  it('uri accepts URLs and URNs', () => {
    expect(ok('uri', 'https://example.test/p/1')).toBe(true);
    expect(ok('uri', 'urn:example:battery:1')).toBe(true);
    expect(ok('uri', 'not a uri')).toBe(false);
  });
  it('multilingualText needs at least one language', () => {
    expect(ok('multilingualText', { en: 'x' })).toBe(true);
    expect(ok('multilingualText', {})).toBe(false);
  });
  it('document is a non-empty list of refs with id', () => {
    expect(ok('document', [{ id: 'DoC-1' }])).toBe(true);
    expect(ok('document', [])).toBe(false);
  });
  it('graphic needs fileName and contentType', () => {
    expect(ok('graphic', { fileName: 'wheelie.png', contentType: 'image/png' })).toBe(true);
    expect(ok('graphic', { fileName: 'wheelie.png' })).toBe(false);
  });
  it('boolean, enum, text, identifier', () => {
    expect(ok('boolean', true)).toBe(true);
    expect(ok('enum', 'Original')).toBe(true);
    expect(ok('text', '')).toBe(false);
    expect(ok('identifier', 'A12')).toBe(true);
  });
  it('composite accepts unknown (checked separately)', () => {
    expect(ok('composite', { anything: 1 })).toBe(true);
  });
});

describe('valueSchemaFor uses the knowledge-base range (D-021)', () => {
  it('accepts the full authored band for the three wide percentage attributes', () => {
    const cases: [string, string][] = [
      ['evolutionOfSelfDischarge', '640'],
      ['internalResistanceIncrease', '150'],
      ['carbonFootprintShareEndOfLife', '-12.5'],
    ];
    for (const [id, value] of cases) {
      const attribute = getAttribute(id);
      expect(attribute, id).toBeDefined();
      expect(valueSchemaFor(attribute!).safeParse(value).success, id).toBe(true);
    }
  });

  it('still rejects a value past the authored band', () => {
    const attribute = getAttribute('internalResistanceIncrease')!;
    expect(valueSchemaFor(attribute).safeParse('1001').success).toBe(false);
  });

  it('keeps 0..100 for a percentage attribute with no authored range', () => {
    const attribute = getAttribute('stateOfCharge')!;
    expect(valueSchemaFor(attribute).safeParse('101').success).toBe(false);
    expect(valueSchemaFor(attribute).safeParse('99.5').success).toBe(true);
  });

  it('applies the band to decimal attributes too', () => {
    const attribute = getAttribute('batteryMass')!; // 0 .. 10000 kg
    expect(valueSchemaFor(attribute).safeParse('10001').success).toBe(false);
    expect(valueSchemaFor(attribute).safeParse('412.5').success).toBe(true);
  });

  it('valueSchemaForKind stays band-less for callers that hold only a kind', () => {
    expect(valueSchemaForKind('decimal').safeParse('99999999').success).toBe(true);
  });
});
