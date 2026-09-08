import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function layerOf(file: string): string {
  const rel = relative(SRC, file).split(sep);
  return rel.length > 1 ? (rel[0] ?? '') : 'root';
}

function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
}

// A relative import can climb any number of directories (`../../views/x`, from
// `workflow/derive/` or `views/parts/`), not just one, so the leading-`../` part matches one or
// more repetitions rather than the fixed `\.\.?\/` that only ever caught a single hop.
const RELATIVE = (name: string) => new RegExp(`^(\\./|(\\.\\./)+)${name}`);

const FORBIDDEN: Record<string, RegExp[]> = {
  workflow: [
    /^react/,
    /^@\/views/,
    /^@\/app/,
    /^@\/components/,
    /^idb-keyval/,
    RELATIVE('(views|app|components)'),
  ],
  views: [/^@\/app/, /^idb-keyval/, RELATIVE('app'), /main\.tsx$/],
  i18n: [/^react/, /^@\/(views|app|workflow|components)/],
};

describe('import boundaries (spec section 3)', () => {
  const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
  it('src has the three layers', () => {
    const layers = new Set(files.map(layerOf));
    expect(layers.has('workflow')).toBe(true);
    expect(layers.has('views')).toBe(true);
    expect(layers.has('app')).toBe(true);
  });
  for (const file of files) {
    const layer = layerOf(file);
    const rules = FORBIDDEN[layer];
    if (!rules) continue;
    it(`${relative(SRC, file)} respects the ${layer} boundary`, () => {
      const bad = imports(file).filter((spec) => rules.some((r) => r.test(spec)));
      expect(bad).toEqual([]);
    });
  }
  it('nothing under src imports node:*', () => {
    const bad = files.filter((f) => imports(f).some((s) => s.startsWith('node:')));
    expect(bad.map((f) => relative(SRC, f))).toEqual([]);
  });
  it('the relative-import patterns catch a two-level climb, not just one', () => {
    // A file two directories deep (e.g. `workflow/derive/x.ts` or `views/parts/x.tsx`) reaches
    // a forbidden layer with `../../`, not `../`. Run the actual matcher over a synthetic
    // import list to prove the pattern still rejects it.
    const workflowRules = FORBIDDEN['workflow'] ?? [];
    const viewsRules = FORBIDDEN['views'] ?? [];
    const specs = ['../../views/X.tsx', './sibling.ts', '@passwerk/core'];
    const workflowBad = specs.filter((spec) => workflowRules.some((r) => r.test(spec)));
    expect(workflowBad).toEqual(['../../views/X.tsx']);
    const viewsBad = ['../../app/store.ts'].filter((spec) => viewsRules.some((r) => r.test(spec)));
    expect(viewsBad).toEqual(['../../app/store.ts']);
  });
});
