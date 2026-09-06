import {
  CarrierInputError,
  generateCarrier,
  PassportDraftError,
  samples,
  VALID_SAMPLE_NAMES,
} from '@passwerk/core';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

const decode = (png: Uint8Array) => {
  const p = PNG.sync.read(Buffer.from(png));
  return jsQR(new Uint8ClampedArray(p.data), p.width, p.height)?.data ?? null;
};
const RESOLVER = 'https://id.musterwerk.example';

describe('generateCarrier', () => {
  it.each(VALID_SAMPLE_NAMES)('%s: encodes the passport identifier as SVG by default', (name) => {
    const r = generateCarrier({ draft: samples[name] });
    expect(r.uid).toBe(samples[name].meta.passportId);
    expect(r.payload).toBe(r.uid);
    expect(r.digitalLink).toBeUndefined();
    expect(r.format).toBe('svg');
    expect(r.mediaType).toBe('image/svg+xml');
    expect(new TextDecoder().decode(r.image).startsWith('<svg')).toBe(true);
    expect(r.isNotLegalAdvice).toBe(true);
    expect(r.sources.length).toBeGreaterThan(0);
  });
  it('encodes the Digital Link when GS1 data is given, and reports both identifiers', () => {
    const r = generateCarrier({
      draft: samples['ev-valid'],
      gs1: { gtin: '4006381333931', serial: 'MW-EV-2026-000123' },
      resolverBase: RESOLVER,
      format: 'png',
    });
    expect(r.digitalLink).toBe(`${RESOLVER}/01/04006381333931/21/MW-EV-2026-000123`);
    expect(r.payload).toBe(r.digitalLink);
    expect(r.uid).toBe(samples['ev-valid'].meta.passportId);
    expect(r.mediaType).toBe('image/png');
    expect(decode(r.image)).toBe(r.digitalLink);
    expect(r.sources).toContain('gs1-digital-link-gtin-serial');
  });
  it('accepts a bare uid', () => {
    const r = generateCarrier({ uid: 'https://passport.example/b/1' });
    expect(r.uid).toBe('https://passport.example/b/1');
    expect(r.payload).toBe(r.uid);
  });
  it('rejects a non-https uid, neither or both inputs, and gs1 without a resolver', () => {
    expect(() => generateCarrier({ uid: 'urn:passwerk:1' })).toThrow(CarrierInputError);
    expect(() => generateCarrier({})).toThrow(CarrierInputError);
    expect(() =>
      generateCarrier({ draft: samples['ev-valid'], uid: 'https://passport.example/b/1' }),
    ).toThrow(CarrierInputError);
    expect(() => generateCarrier({ draft: samples['ev-valid'], gs1: { giai: 'A1' } })).toThrow(
      CarrierInputError,
    );
  });
  it('a structurally invalid draft throws PassportDraftError', () => {
    expect(() => generateCarrier({ draft: { meta: { category: 'EV' } } })).toThrow(
      PassportDraftError,
    );
  });
  it('is byte-identical across runs', () => {
    const a = generateCarrier({ draft: samples['lmt-valid'], format: 'png' }).image;
    const b = generateCarrier({ draft: samples['lmt-valid'], format: 'png' }).image;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
