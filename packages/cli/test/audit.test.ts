import { run } from '@passwerk/cli';
import { describe, expect, it } from 'vitest';
import { captureIo, sampleFiles } from './harness.ts';

const files = sampleFiles();

describe('passwerk audit', () => {
  it('a valid golden draft exits 0 and prints the verdict', async () => {
    const io = captureIo(files);
    expect(await run(['audit', 'samples/ev-valid.json'], io)).toBe(0);
    expect(io.out()).toMatch(/^Verdict: valid\. 0 errors, 0 warnings\./);
    expect(io.err()).toBe('');
  });

  it('warnings only exit 1', async () => {
    const io = captureIo(files);
    expect(await run(['audit', 'samples/ev-document-without-classification.json'], io)).toBe(1);
    expect(io.out()).toContain('Verdict: valid_with_warnings');
  });

  it('an invalid draft exits 2 and lists every finding with rule id and path', async () => {
    const io = captureIo(files);
    expect(await run(['audit', 'samples/lmt-missing-state-of-charge.json'], io)).toBe(2);
    expect(io.out()).toContain('Verdict: invalid');
    expect(io.out()).toMatch(/- \[L3\] PW-L3-MISSING /);
  });

  it('a draft that fails L1 exits 2 with the L1 findings', async () => {
    const io = captureIo(files);
    expect(await run(['audit', 'samples/industrial-bad-decimal.json'], io)).toBe(2);
    expect(io.out()).toContain('Verdict: invalid');
    expect(io.out()).toMatch(/- \[L1\] PW-L1-VALUE /);
  });

  it('a missing or unparsable file is a usage error (3)', async () => {
    const io = captureIo({
      ...files,
      '/work/bad.json': new TextEncoder().encode('{not json'),
    });
    expect(await run(['audit', 'samples/nope.json'], io)).toBe(3);
    expect(io.err()).toMatch(/samples\/nope\.json/);
    const bad = captureIo({ '/work/bad.json': new TextEncoder().encode('{not json') });
    expect(await run(['audit', 'bad.json'], bad)).toBe(3);
    expect(bad.err()).toMatch(/bad\.json/);
  });

  it('--json prints canonical JSON with the verdict and findings', async () => {
    const io = captureIo(files);
    expect(await run(['audit', 'samples/lmt-valid.json', '--json'], io)).toBe(0);
    const parsed = JSON.parse(io.out()) as { verdict: string; findings: unknown[]; layers: object };
    expect(parsed.verdict).toBe('valid');
    expect(parsed.findings).toEqual([]);
    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
  });

  it('--lang de prints the German summary and messages', async () => {
    const io = captureIo(files);
    await run(['audit', 'samples/lmt-missing-state-of-charge.json', '--lang', 'de'], io);
    expect(io.out()).toMatch(/^Ergebnis: invalid\./);
  });

  it('--as-of is passed to the plausibility layer', async () => {
    const io = captureIo(files);
    expect(
      await run(['audit', 'samples/ev-valid.json', '--as-of', '2027-06-01T00:00:00Z'], io),
    ).toBe(0);
  });

  it('two runs are byte-identical', async () => {
    const a = captureIo(files);
    const b = captureIo(files);
    await run(['audit', 'samples/lmt-missing-state-of-charge.json', '--json'], a);
    await run(['audit', 'samples/lmt-missing-state-of-charge.json', '--json'], b);
    expect(a.out()).toBe(b.out());
  });
});
