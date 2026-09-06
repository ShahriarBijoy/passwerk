import {
  buildGs1DigitalLink,
  CarrierInputError,
  gtinCheckDigit,
  isHttpsUri,
  normaliseGtin,
} from '@passwerk/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// Hand-computed with the GS1 mod-10 algorithm (weights 3,1,3,1,... from the right):
// 400638133393 -> sum 89 -> check 1; 9638507 -> sum 86 -> check 4.
describe('gtinCheckDigit', () => {
  it('matches hand-computed vectors', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1);
    expect(gtinCheckDigit('9638507')).toBe(4);
    expect(gtinCheckDigit('0400638133393')).toBe(1);
  });
  it('appending the digit always validates; changing any digit never does', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{13}$/), (body) => {
        const gtin = `${body}${gtinCheckDigit(body)}`;
        expect(normaliseGtin(gtin)).toBe(gtin);
        const i = 3;
        const flipped = `${gtin.slice(0, i)}${(Number(gtin[i]) + 1) % 10}${gtin.slice(i + 1)}`;
        expect(() => normaliseGtin(flipped)).toThrow(CarrierInputError);
      }),
    );
  });
});

describe('normaliseGtin', () => {
  it('pads 8, 12 and 13 digit GTINs to 14', () => {
    expect(normaliseGtin('4006381333931')).toBe('04006381333931');
    expect(normaliseGtin('96385074')).toBe('00000096385074');
    expect(normaliseGtin('04006381333931')).toBe('04006381333931');
  });
  it('rejects other lengths, non-digits and a wrong check digit with DE/EN text', () => {
    for (const bad of ['4006381333932', '12345', 'ABCD', '4006 381333931', '']) {
      try {
        normaliseGtin(bad);
        throw new Error(`accepted ${bad}`);
      } catch (e) {
        expect(e).toBeInstanceOf(CarrierInputError);
        const err = e as CarrierInputError;
        expect(err.text.de.length).toBeGreaterThan(0);
        expect(err.text.en.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildGs1DigitalLink', () => {
  it('builds the GTIN + serial form', () => {
    expect(
      buildGs1DigitalLink('https://id.musterwerk.example', {
        gtin: '4006381333931',
        serial: 'MW-EV-2026-000123',
      }),
    ).toBe('https://id.musterwerk.example/01/04006381333931/21/MW-EV-2026-000123');
  });
  it('builds the GIAI form, strips a trailing slash and keeps a base path', () => {
    expect(buildGs1DigitalLink('https://id.example.com/', { giai: 'MW-ASSET-7' })).toBe(
      'https://id.example.com/8004/MW-ASSET-7',
    );
    expect(buildGs1DigitalLink('https://example.com/resolver/', { giai: 'A1' })).toBe(
      'https://example.com/resolver/8004/A1',
    );
  });
  it('percent-encodes reserved characters in the serial', () => {
    expect(
      buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'A/B#1?x y' }),
    ).toBe('https://id.example.com/01/00000096385074/21/A%2FB%231%3Fx%20y');
  });
  it('rejects a non-https base, a base with query or fragment, and over-long keys', () => {
    expect(() => buildGs1DigitalLink('http://id.example.com', { giai: 'A' })).toThrow(
      CarrierInputError,
    );
    expect(() => buildGs1DigitalLink('https://id.example.com?x=1', { giai: 'A' })).toThrow(
      CarrierInputError,
    );
    expect(() => buildGs1DigitalLink('https://id.example.com#f', { giai: 'A' })).toThrow(
      CarrierInputError,
    );
    expect(() => buildGs1DigitalLink('id.example.com', { giai: 'A' })).toThrow(CarrierInputError);
    expect(() =>
      buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'x'.repeat(21) }),
    ).toThrow(/20/);
    expect(() => buildGs1DigitalLink('https://id.example.com', { giai: 'x'.repeat(31) })).toThrow(
      /30/,
    );
    expect(() => buildGs1DigitalLink('https://id.example.com', { giai: '' })).toThrow(
      CarrierInputError,
    );
    expect(() =>
      buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'a\tb' }),
    ).toThrow(CarrierInputError);
  });
});

describe('isHttpsUri', () => {
  it('accepts only absolute https URIs', () => {
    expect(isHttpsUri('https://passport.musterwerk.example/battery/MW-EV-2026-000123')).toBe(true);
    expect(isHttpsUri('http://passport.example')).toBe(false);
    expect(isHttpsUri('urn:passwerk:draft:1')).toBe(false);
    expect(isHttpsUri('MW-EV-2026-000123')).toBe(false);
  });
});
