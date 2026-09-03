import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('browser safety (ADR D-006)', () => {
  it('core/src never imports node:* modules', () => {
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from\s+['"]node:/);
      expect(text, file).not.toMatch(/import\(\s*['"]node:/);
      expect(text, file).not.toMatch(/require\(\s*['"]node:/);
    }
  });
});
