import { getSample, type PassportDraft, readAasxEnvironment } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { derive } from '@/workflow/derive/index.ts';
import { buildExports, slug } from '@/workflow/exports.ts';
import { reduce } from '@/workflow/reducer.ts';
import { initialState } from '@/workflow/state.ts';

const AT = '2026-09-05T12:00:00Z';

describe('exports', () => {
  it('keeps all five document exports when the QR exceeds byte capacity', () => {
    const draft = structuredClone(getSample('ev-valid')) as PassportDraft;
    draft.meta.passportId = `https://example.com/${'界'.repeat(900)}`;
    draft.attributes['batteryPassportIdentifier'] = {
      ...draft.attributes['batteryPassportIdentifier'],
      value: draft.meta.passportId,
      status: 'present',
      source: [],
    };
    const d = derive(reduce(initialState, { type: 'importDraft', draft, at: AT }), AT);
    if (!d) throw new Error('no derived');
    const out = buildExports(d);
    if ('error' in out) throw new Error(out.error.en);
    expect(out.verdict).toBe('valid');
    expect(Object.keys(out.files).sort()).toEqual(['aasJson', 'aasx', 'draft', 'gaps', 'html']);
    expect(out.files.qr).toBeUndefined();
    expect(out.carrierError?.en).toContain('too long for a QR code');
    expect(out.carrierError?.de).toBeTruthy();
  });
  it('slug keeps letters, digits, dot and dash', () => {
    expect(slug('https://passport.musterwerk.example/battery/MW-EV-2026-000123')).toBe(
      'passport.musterwerk.example-battery-mw-ev-2026-000123',
    );
    expect(slug('urn:passwerk:draft:abc')).toBe('passwerk-draft-abc');
  });
  it('produces six files whose AASX contains the same environment as the JSON', () => {
    const s = reduce(initialState, {
      type: 'importDraft',
      draft: getSample('ev-valid') as PassportDraft,
      at: AT,
    });
    const d = derive(s, AT);
    if (!d) throw new Error('no derived');
    const out = buildExports(d, 'de');
    if ('error' in out) throw new Error(out.error.en);
    expect(out.verdict).toBe('valid');
    const base = slug(d.draft.meta.passportId);
    expect(Object.keys(out.files).sort()).toEqual([
      'aasJson',
      'aasx',
      'draft',
      'gaps',
      'html',
      'qr',
    ]);
    expect(out.files.aasJson?.name).toBe(`${base}.aas.json`);
    expect(out.files.aasx?.name).toBe(`${base}.aasx`);
    expect(out.files.draft?.name).toBe(`${base}.draft.json`);
    expect(out.files.gaps?.name).toBe(`${base}.gaps.json`);
    expect(out.files.html?.name).toBe(`${base}.html`);
    expect(out.files.qr?.name).toBe(`${base}.qr.svg`);
    const json = JSON.parse(new TextDecoder().decode(out.files.aasJson?.bytes));
    expect(readAasxEnvironment(out.files.aasx?.bytes ?? new Uint8Array())).toEqual(json);
    const html = new TextDecoder().decode(out.files.html?.bytes);
    expect(html).toContain('id="lang-de" checked');
    expect(html).toContain('<span class="verdict valid">valid</span>');
    expect(new TextDecoder().decode(out.files.qr?.bytes).startsWith('<svg')).toBe(true);
    expect(out.files.html?.type).toBe('text/html');
    expect(out.files.qr?.type).toBe('image/svg+xml');
  });
  it('omits the QR file and reports a carrierError for a non-https passport id', () => {
    const sample = structuredClone(getSample('ev-valid')) as PassportDraft;
    sample.meta.passportId = 'urn:passwerk:draft:test';
    (sample.attributes as Record<string, { value?: unknown }>)['batteryPassportIdentifier'] = {
      ...(sample.attributes as Record<string, { value?: unknown }>)['batteryPassportIdentifier'],
      value: 'urn:passwerk:draft:test',
    };
    const s = reduce(initialState, { type: 'importDraft', draft: sample, at: AT });
    const d = derive(s, AT);
    if (!d) throw new Error('no derived');
    const out = buildExports(d, 'de');
    if ('error' in out) throw new Error(out.error.en);
    const base = slug(d.draft.meta.passportId);
    expect(Object.keys(out.files).sort()).toEqual(['aasJson', 'aasx', 'draft', 'gaps', 'html']);
    expect(out.files.aasJson?.name).toBe(`${base}.aas.json`);
    expect(out.carrierError?.de).toBeTruthy();
    expect(out.carrierError?.en).toBeTruthy();
  });
});
