import { run } from '@passwerk/cli';
import { describe, expect, it } from 'vitest';
import { captureIo, TEST_CLOCK } from './harness.ts';

describe('passwerk obligations', () => {
  it('required exits 0 and names the category and the mandatory count', async () => {
    const io = captureIo();
    const code = await run(
      ['obligations', '--type', 'EV', '--role', 'manufacturer', '--placed-on-market', '2027-06-01'],
      io,
    );
    expect(code).toBe(0);
    expect(io.out()).toMatch(/^required: /);
    expect(io.out()).toContain('Category: EV');
    expect(io.out()).toMatch(/Mandatory attributes: [1-9]\d*/);
    expect(io.out()).toContain('Not legal advice');
    expect(io.out()).toMatch(/^Sources:/m);
  });

  it('not_required exits 1', async () => {
    const io = captureIo();
    const code = await run(
      ['obligations', '--type', 'PORTABLE', '--role', 'importer', '--placed-on-market', '2027-06-01'],
      io,
    );
    expect(code).toBe(1);
    expect(io.out()).toMatch(/^not_required: /);
  });

  it('insufficient_input exits 2 and says what is missing', async () => {
    const io = captureIo();
    const code = await run(['obligations', '--type', 'INDUSTRIAL', '--role', 'importer'], io);
    expect(code).toBe(2);
    expect(io.out()).toMatch(/^insufficient_input: /);
    expect(io.out()).toMatch(/Missing input: .*energyKwh/);
  });

  it('--energy-kwh settles the industrial threshold', async () => {
    const io = captureIo();
    const code = await run(
      ['obligations', '--type', 'INDUSTRIAL', '--role', 'importer', '--energy-kwh', '5', '--placed-on-market', '2027-06-01'],
      io,
    );
    expect(code).toBe(0);
    expect(io.out()).toContain('Category: INDUSTRIAL_GT_2KWH');
  });

  it('missing --type or an unknown type or role is a usage error (3)', async () => {
    expect(await run(['obligations', '--role', 'manufacturer'], captureIo())).toBe(3);
    const bad = captureIo();
    expect(await run(['obligations', '--type', 'TOASTER', '--role', 'manufacturer'], bad)).toBe(3);
    expect(bad.err()).toMatch(/batteryType/);
    expect(await run(['obligations', '--type', 'EV', '--role', 'nobody'], captureIo())).toBe(3);
  });

  it('--json carries the result; asOf defaults to the injected clock', async () => {
    const io = captureIo();
    await run(['obligations', '--type', 'EV', '--role', 'manufacturer', '--json'], io);
    const parsed = JSON.parse(io.out()) as { asOf: string; isNotLegalAdvice: boolean; sources: string[] };
    expect(parsed.asOf).toBe(TEST_CLOCK);
    expect(parsed.isNotLegalAdvice).toBe(true);
    expect(parsed.sources.length).toBeGreaterThan(0);
  });

  it('--lang de prints the German reason', async () => {
    const io = captureIo();
    await run(['obligations', '--type', 'EV', '--role', 'manufacturer', '--lang', 'de'], io);
    expect(io.out()).toContain('Keine Rechtsberatung');
  });
});
