import { run } from '@passwerk/cli';
import { describe, expect, it } from 'vitest';
import { captureIo, sampleFiles, utf8 } from './harness.ts';

const files = sampleFiles();
const written = (io: ReturnType<typeof captureIo>) => [...io.fs.written.keys()].sort();

describe('passwerk emit', () => {
  it('writes AAS JSON, AASX, draft JSON and the HTML sheet into --out and exits by the re-validation verdict', async () => {
    const io = captureIo(files);
    expect(await run(['emit', 'samples/ev-valid.json', '--out', 'out'], io)).toBe(0);
    const paths = written(io);
    expect(paths).toHaveLength(4);
    expect(paths.some((p) => p.startsWith('/work/out/') && p.endsWith('.aas.json'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.aasx'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.draft.json'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.html'))).toBe(true);
    expect(io.out()).toMatch(/^Re-validation verdict: valid\./);
    for (const p of paths) expect(io.out()).toContain(p);
  });

  it('--targets restricts the outputs', async () => {
    const io = captureIo(files);
    expect(
      await run(['emit', 'samples/lmt-valid.json', '--out', 'out', '--targets', 'aasx'], io),
    ).toBe(0);
    expect(written(io)).toHaveLength(1);
    expect(written(io)[0]).toMatch(/\.aasx$/);
  });

  it('is fail-honest: a broken draft still writes files but exits 2 with the findings', async () => {
    const io = captureIo(files);
    expect(
      await run(['emit', 'samples/lmt-missing-state-of-charge.json', '--out', 'out'], io),
    ).toBe(2);
    expect(written(io)).toHaveLength(4);
    expect(io.out()).toContain('Re-validation verdict: invalid');
    expect(io.out()).toMatch(/- \[L3\] PW-L3-MISSING /);
  });

  it('a draft with an L1 value error is still emitted (fail-honest) and exits 2', async () => {
    const io = captureIo(files);
    expect(await run(['emit', 'samples/industrial-bad-decimal.json', '--out', 'out'], io)).toBe(2);
    expect(written(io)).toHaveLength(4);
    expect(io.out()).toMatch(/- \[L1\] PW-L1-VALUE /);
  });

  it('--out is required and targets are checked (exit 3)', async () => {
    const io = captureIo(files);
    expect(await run(['emit', 'samples/ev-valid.json'], io)).toBe(3);
    const bad = captureIo(files);
    expect(
      await run(['emit', 'samples/ev-valid.json', '--out', 'o', '--targets', 'pdf'], bad),
    ).toBe(3);
    expect(bad.err()).toMatch(/pdf/);
  });

  it('--targets html writes the sheet in --lang and re-validates', async () => {
    const io = captureIo(files);
    expect(
      await run(
        ['emit', 'samples/ev-valid.json', '--out', 'out', '--targets', 'html', '--lang', 'de'],
        io,
      ),
    ).toBe(0);
    const [path] = written(io);
    expect(path).toMatch(/\.html$/);
    expect(utf8(io.fs.written.get(path ?? '') ?? new Uint8Array())).toContain(
      'id="lang-de" checked',
    );
  });

  it('--json reports the files and the verdict', async () => {
    const io = captureIo(files);
    expect(await run(['emit', 'samples/ev-valid.json', '--out', 'out', '--json'], io)).toBe(0);
    const parsed = JSON.parse(io.out()) as {
      verdict: string;
      files: { target: string; path: string }[];
    };
    expect(parsed.verdict).toBe('valid');
    expect(parsed.files.map((f) => f.target)).toEqual(['aas-json', 'aasx', 'draft-json', 'html']);
  });
});
