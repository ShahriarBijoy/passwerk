import { run } from '@passwerk/cli';
import { TOOLS } from '@passwerk/server';
import { describe, expect, it } from 'vitest';
import { captureIo } from './harness.ts';

describe('passwerk tools', () => {
  it('lists every registry tool with title, description and input keys', async () => {
    const io = captureIo();
    expect(await run(['tools'], io)).toBe(0);
    const out = io.out();
    expect(TOOLS).toHaveLength(12);
    for (const t of TOOLS) {
      expect(out).toContain(t.name);
      expect(out).toContain(t.title);
    }
    expect(out).toMatch(/validate_passport .*\n.*draft, asOf, skipPlausibility, lang/);
  });

  it('--json is the registry in order with annotations', async () => {
    const io = captureIo();
    expect(await run(['tools', '--json'], io)).toBe(0);
    const parsed = JSON.parse(io.out()) as {
      name: string;
      title: string;
      description: string;
      inputKeys: string[];
      annotations: { readOnlyHint: boolean };
    }[];
    expect(parsed.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(parsed[0]?.inputKeys).toContain('lang');
    expect(parsed.find((t) => t.name === 'emit_passport')?.annotations.readOnlyHint).toBe(false);
  });
});
