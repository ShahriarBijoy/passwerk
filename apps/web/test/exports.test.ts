import { getSample, type PassportDraft, readAasxEnvironment } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { derive } from '@/workflow/derive.ts';
import { buildExports, slug } from '@/workflow/exports.ts';
import { reduce } from '@/workflow/reducer.ts';
import { initialState } from '@/workflow/state.ts';

const AT = '2026-09-05T12:00:00Z';

describe('exports', () => {
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
});
