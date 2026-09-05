import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from '../src/base64.ts';

describe('base64', () => {
  it('round-trips bytes including zero and high values', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  });

  it('matches the well-known encoding of a string', () => {
    expect(encodeBase64(new TextEncoder().encode('passwerk'))).toBe('cGFzc3dlcms=');
    expect(new TextDecoder().decode(decodeBase64('cGFzc3dlcms='))).toBe('passwerk');
  });

  it('tolerates whitespace and rejects invalid input', () => {
    expect(new TextDecoder().decode(decodeBase64('cGFz\nc3dl cms='))).toBe('passwerk');
    expect(() => decodeBase64('***')).toThrow(/invalid base64/);
    expect(() => decodeBase64('abcde')).toThrow(/invalid base64/);
  });
});
