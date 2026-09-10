import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(import.meta.dirname, '..', 'src', 'fonts');
const FILES = [
  'space-grotesk.woff2',
  'space-mono-regular.woff2',
  'space-mono-bold.woff2',
  'doto.woff2',
];

describe('bundled fonts', () => {
  const provenance = existsSync(join(DIR, 'PROVENANCE.md'))
    ? readFileSync(join(DIR, 'PROVENANCE.md'), 'utf8')
    : '';
  for (const file of FILES) {
    it(`${file} exists, is WOFF2 and matches PROVENANCE.md`, () => {
      const bytes = readFileSync(join(DIR, file));
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
      const sha = createHash('sha256').update(bytes).digest('hex');
      expect(provenance, `${file} sha256 ${sha}`).toContain(sha);
    });
  }
  it('index.css loads the fonts locally and nothing from a font host', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8');
    for (const file of FILES) expect(css).toContain(`./fonts/${file}`);
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|https?:\/\//);
  });
});
