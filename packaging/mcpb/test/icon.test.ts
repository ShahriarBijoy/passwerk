import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - .mjs build helper, deliberately untyped
import { iconPng } from '../scripts/icon.mjs';

describe('the bundle icon', () => {
  it('is a 512x512 PNG', () => {
    const png = iconPng();
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
  });

  it('is deterministic', () => {
    expect(iconPng().equals(iconPng())).toBe(true);
  });

  it('matches the committed icon.png', () => {
    const committed = readFileSync(fileURLToPath(new URL('../icon.png', import.meta.url)));
    expect(iconPng().equals(committed)).toBe(true);
  });
});
