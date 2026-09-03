import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Browser-safe packages (ADR D-006): core and rules. */
const ROOTS = [
  join(import.meta.dirname, '..', 'src'),
  join(import.meta.dirname, '..', '..', 'rules', 'src'),
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('browser safety (ADR D-006)', () => {
  it('core/src and rules/src never import node:* modules', () => {
    const files = ROOTS.flatMap(walk);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from\s+['"]node:/);
      expect(text, file).not.toMatch(/import\(\s*['"]node:/);
      expect(text, file).not.toMatch(/require\(\s*['"]node:/);
    }
  });
});
