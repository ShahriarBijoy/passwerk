import { generateCarrier, getSample } from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeBase64 } from '../src/base64.ts';
import { call, connect, memoryFileSystem } from './harness.ts';

interface Out {
  draftId?: string;
  uid: string;
  digitalLink?: string;
  payload: string;
  format: string;
  mediaType: string;
  image: { name: string; size: number; path?: string; bytes?: string };
  isNotLegalAdvice: true;
  sources: string[];
}

let session: Awaited<ReturnType<typeof connect>>;
beforeAll(async () => {
  session = await connect({ fs: memoryFileSystem({}) });
});
afterAll(() => session.close());

describe('generate_carrier', () => {
  it('a draft yields an SVG of its identifier inline, with a draft id', async () => {
    const draft = getSample('ev-valid');
    const r = await call<Out>(session.client, 'generate_carrier', { draft });
    expect(r.isError).toBe(false);
    expect(r.structured.draftId).toMatch(/^drf_/);
    expect(r.structured.uid).toBe(draft.meta.passportId);
    expect(r.structured.payload).toBe(draft.meta.passportId);
    expect(r.structured.mediaType).toBe('image/svg+xml');
    expect(r.structured.image.name).toMatch(/\.qr\.svg$/);
    const svg = new TextDecoder().decode(decodeBase64(r.structured.image.bytes ?? ''));
    expect(svg).toBe(new TextDecoder().decode(generateCarrier({ draft }).image));
    expect(r.structured.isNotLegalAdvice).toBe(true);
    expect(r.text).toMatch(/^QR payload: https:\/\//);
  });
  it('a uid with GS1 data yields a PNG Digital Link written into outDir', async () => {
    const r = await call<Out>(session.client, 'generate_carrier', {
      uid: 'https://passport.musterwerk.example/battery/MW-EV-2026-000123',
      gs1: { gtin: '4006381333931', serial: 'MW-EV-2026-000123' },
      resolverBase: 'https://id.musterwerk.example',
      format: 'png',
      outDir: 'out',
      lang: 'de',
    });
    expect(r.isError).toBe(false);
    expect(r.structured.digitalLink).toBe(
      'https://id.musterwerk.example/01/04006381333931/21/MW-EV-2026-000123',
    );
    expect(r.structured.payload).toBe(r.structured.digitalLink);
    expect(r.structured.image.path).toBe(
      '/work/out/passport.musterwerk.example-battery-mw-ev-2026-000123.qr.png',
    );
    expect(r.structured.image.bytes).toBeUndefined();
    expect(r.structured.sources).toContain('gs1-digital-link-gtin-serial');
    expect(r.text).toMatch(/^QR-Inhalt: /);
  });
  it('input errors are fail-honest results with DE/EN text, not crashes', async () => {
    const bad = await call<{ error: string }>(session.client, 'generate_carrier', {
      uid: 'urn:passwerk:1',
    });
    expect(bad.isError).toBe(true);
    expect(bad.structured.error).toMatch(/https/);
    const gtin = await call<{ error: string }>(session.client, 'generate_carrier', {
      uid: 'https://passport.example/1',
      gs1: { gtin: '4006381333932', serial: 'S' },
      resolverBase: 'https://id.example.com',
      lang: 'de',
    });
    expect(gtin.isError).toBe(true);
    expect(gtin.text).toMatch(/Prüfziffer/);
  });
  it('accepts a draftId it returned earlier', async () => {
    const draft = getSample('lmt-valid');
    const a = await call<Out>(session.client, 'generate_carrier', { draft });
    const b = await call<Out>(session.client, 'generate_carrier', {
      draft: { draftId: a.structured.draftId },
    });
    expect(b.structured.image.bytes).toBe(a.structured.image.bytes);
  });
});
