import { getSample, type PassportDraft, readAasxEnvironment } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { derive } from '@/workflow/derive.ts';
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
    expect(out.files).toHaveLength(5);
    expect(out.files.map((file) => file.name.split('.').at(-1))).toEqual([
      'json',
      'aasx',
      'json',
      'json',
      'html',
    ]);
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
    expect(out.files.map((f) => f.name)).toEqual([
      `${base}.aas.json`,
      `${base}.aasx`,
      `${base}.draft.json`,
      `${base}.gaps.json`,
      `${base}.html`,
      `${base}.qr.svg`,
    ]);
    const json = JSON.parse(new TextDecoder().decode(out.files[0]?.bytes));
    expect(readAasxEnvironment(out.files[1]?.bytes ?? new Uint8Array())).toEqual(json);
    const html = new TextDecoder().decode(out.files[4]?.bytes);
    expect(html).toContain('id="lang-de" checked');
    expect(html).toContain('<span class="verdict valid">valid</span>');
    expect(new TextDecoder().decode(out.files[5]?.bytes).startsWith('<svg')).toBe(true);
    expect(out.files[4]?.type).toBe('text/html');
    expect(out.files[5]?.type).toBe('image/svg+xml');
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
    expect(out.files.map((f) => f.name)).toEqual([
      `${base}.aas.json`,
      `${base}.aasx`,
      `${base}.draft.json`,
      `${base}.gaps.json`,
      `${base}.html`,
    ]);
    expect(out.carrierError?.de).toBeTruthy();
    expect(out.carrierError?.en).toBeTruthy();
  });
});
