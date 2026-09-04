import { a1, decodeText, detectLang, rcRef, tableRef } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('decodeText', () => {
  it('strips a UTF-8 BOM', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
  });
  it('falls back to windows-1252 when bytes are not valid UTF-8', () => {
    // "Kapazität" in windows-1252: ä = 0xE4
    const bytes = new Uint8Array([0x4b, 0x61, 0x70, 0x61, 0x7a, 0x69, 0x74, 0xe4, 0x74]);
    expect(decodeText(bytes)).toBe('Kapazität');
  });
  it('keeps valid UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('Batteriemasse 12 kg'))).toBe('Batteriemasse 12 kg');
  });
});

describe('detectLang', () => {
  it('detects German by stop words', () => {
    expect(detectLang('Die Batterie ist mit der Kapazität von 94 Ah nicht für Fahrzeuge')).toBe(
      'de',
    );
  });
  it('detects English by stop words', () => {
    expect(detectLang('The battery is rated for 94 Ah and the mass of the pack is 400 kg')).toBe(
      'en',
    );
  });
  it('defaults to German on a tie', () => {
    expect(detectLang('94,5 Ah')).toBe('de');
  });
  it('detects English technical vocabulary without stop words', () => {
    expect(detectLang('Rated capacity 94.5 Ah; Nominal voltage 355.2 V')).toBe('en');
  });
  it('detects German technical vocabulary without stop words', () => {
    expect(detectLang('Nennkapazität 94,5 Ah; Batteriemasse 412,7 kg')).toBe('de');
  });
  it('does not flip to English on incidental EN_TECH substrings in German text', () => {
    expect(detectLang('Orange Hochvoltkabel, Update der Firmware, Gemeinde Bremen')).toBe('de');
  });
  it('still detects English technical vocabulary as exact tokens', () => {
    expect(detectLang('Rated capacity and nominal voltage of the pack')).toBe('en');
  });
  it('detects short German technical vocabulary as whole tokens, not just compounds', () => {
    expect(detectLang('Wert 94,5 Ah Masse 412 kg')).toBe('de');
  });
});

describe('cell refs', () => {
  it('a1 converts 1-based row and column', () => {
    expect(a1(1, 1)).toBe('A1');
    expect(a1(7, 2)).toBe('B7');
    expect(a1(3, 27)).toBe('AA3');
  });
  it('rcRef and tableRef', () => {
    expect(rcRef(3, 2)).toBe('R3C2');
    expect(tableRef(1, 2, 3)).toBe('T1:R2C3');
  });
});
