import { run } from '@passwerk/cli';
import { generateCarrier, getSample } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { captureIo, sampleFiles, utf8 } from './harness.ts';

const files = sampleFiles();

describe('passwerk carrier', () => {
  it('writes the SVG of the draft identifier to --out and prints the payload', async () => {
    const io = captureIo(files);
    expect(await run(['carrier', 'samples/ev-valid.json', '--out', 'out/qr.svg'], io)).toBe(0);
    const bytes = io.fs.written.get('/work/out/qr.svg');
    expect(bytes).toBeDefined();
    expect(utf8(bytes ?? new Uint8Array())).toBe(
      utf8(generateCarrier({ draft: getSample('ev-valid') }).image),
    );
    expect(io.out()).toContain(
      'Identifier: https://passport.musterwerk.example/battery/MW-EV-2026-000123',
    );
    expect(io.out()).toContain('Wrote: /work/out/qr.svg');
  });
  it('--uid with GS1 data writes a PNG of the Digital Link', async () => {
    const io = captureIo();
    expect(
      await run(
        [
          'carrier',
          '--uid',
          'https://passport.example/b/1',
          '--gtin',
          '4006381333931',
          '--serial',
          'MW-1',
          '--resolver-base',
          'https://id.example.com',
          '--format',
          'png',
          '--out',
          'qr.png',
          '--lang',
          'de',
        ],
        io,
      ),
    ).toBe(0);
    const bytes = io.fs.written.get('/work/qr.png') ?? new Uint8Array();
    expect([...bytes.slice(0, 4)]).toEqual([137, 80, 78, 71]);
    expect(io.out()).toContain(
      'GS1 Digital Link: https://id.example.com/01/04006381333931/21/MW-1',
    );
    expect(io.out()).toContain('Geschrieben: /work/qr.png');
  });
  it('--json prints the structured result with the path', async () => {
    const io = captureIo(files);
    expect(await run(['carrier', 'samples/lmt-valid.json', '--out', 'q.svg', '--json'], io)).toBe(
      0,
    );
    const parsed = JSON.parse(io.out()) as { uid: string; payload: string; path: string };
    expect(parsed.uid).toBe(getSample('lmt-valid').meta.passportId);
    expect(parsed.path).toBe('/work/q.svg');
  });
  it('usage errors exit 3: no --out, draft and --uid together, neither, gtin without serial', async () => {
    const a = captureIo(files);
    expect(await run(['carrier', 'samples/ev-valid.json'], a)).toBe(3);
    const b = captureIo(files);
    expect(
      await run(
        ['carrier', 'samples/ev-valid.json', '--uid', 'https://x.example/1', '--out', 'q.svg'],
        b,
      ),
    ).toBe(3);
    const c = captureIo();
    expect(await run(['carrier', '--out', 'q.svg'], c)).toBe(3);
    const d = captureIo();
    expect(
      await run(
        ['carrier', '--uid', 'https://x.example/1', '--gtin', '96385074', '--out', 'q.svg'],
        d,
      ),
    ).toBe(3);
    expect(d.err()).toMatch(/--serial/);
  });
  it('a carrier input error (wrong check digit) exits 3 with the message', async () => {
    const io = captureIo();
    expect(
      await run(
        [
          'carrier',
          '--uid',
          'https://x.example/1',
          '--gtin',
          '4006381333932',
          '--serial',
          'S',
          '--resolver-base',
          'https://id.example.com',
          '--out',
          'q.svg',
        ],
        io,
      ),
    ).toBe(3);
    expect(io.err()).toMatch(/check digit/);
    expect(io.fs.written.size).toBe(0);
  });
});
