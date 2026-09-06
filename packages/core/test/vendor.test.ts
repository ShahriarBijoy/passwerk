import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');
const VENDOR = join('vendor', 'aasCore.ts');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('AAS SDK access (ADR D-034)', () => {
  it('only src/vendor/aasCore.ts names @aas-core-works/aas-core3.0-typescript', () => {
    const offenders = walk(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('aas-core3.0-typescript'))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([VENDOR]);
  });
});
