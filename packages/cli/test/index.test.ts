import { PACKAGE_NAME, run } from '@passwerk/cli';
import { describe, expect, it } from 'vitest';
import { captureIo } from './harness.ts';

const COMMANDS = ['audit', 'extract', 'emit', 'gaps', 'obligations', 'tools', 'chat'];

describe('@passwerk/cli', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@passwerk/cli');
  });

  it('--help lists every command and exits 0', async () => {
    const io = captureIo();
    expect(await run(['--help'], io)).toBe(0);
    for (const c of COMMANDS) expect(io.out(), c).toContain(c);
    expect(io.err()).toBe('');
  });

  it('an unknown command is a usage error (exit 3) on stderr', async () => {
    const io = captureIo();
    expect(await run(['nope'], io)).toBe(3);
    expect(io.err()).toMatch(/unknown command/i);
    expect(io.out()).toBe('');
  });

  it('no command is a usage error (exit 3)', async () => {
    const io = captureIo();
    expect(await run([], io)).toBe(3);
    expect(io.err()).toContain('Usage');
  });

  it('--version prints the package version', async () => {
    const io = captureIo();
    expect(await run(['--version'], io)).toBe(0);
    expect(io.out().trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
