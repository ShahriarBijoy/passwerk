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
  it('the shell reaches the browser only through platform.ts (Phase 7b)', () => {
    // The MCP App (apps/mcp-app) renders the same `App` inside a host iframe and supplies its
    // own download, persistence and pdf.js worker. Those three must enter as a prop, never as
    // imports, or the iframe build drags in IndexedDB and an anchor download it cannot use.
    const app = join(SRC, 'app', 'App.tsx');
    const bad = imports(app).filter(
      (s) => /(persistence|download)\.ts$/.test(s) || /\?url$/.test(s),
    );
    expect(bad).toEqual([]);
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

  it('names a model endpoint only in app/assist', () => {
    // apps/mcp-app builds its bundle from `views`, `workflow`, `i18n`, `components` and the
    // shared `app/App.tsx`, and supplies no `Platform.assist`. Only `browserPlatform` reaches
    // `app/assist/providers.ts`, and the MCP App does not import it, so nothing pulls an
    // endpoint into that bundle (ADR D-038). This checks the rule at the source; the MCP App's
    // own sovereignty spec checks the built artefact.
    const marks = ['api.anthropic.com', '/chat/completions'];
    const offenders = files.filter((f) => {
      const rel = relative(SRC, f).split(sep).join('/');
      if (rel.startsWith('app/assist/')) return false;
      const text = readFileSync(f, 'utf8');
      return marks.some((m) => text.includes(m));
    });
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it('keeps the assist transport out of the workflow layer', () => {
    const assist = files.filter((f) =>
      relative(SRC, f).split(sep).join('/').startsWith('workflow/assist/'),
    );
    expect(assist.length).toBeGreaterThan(0);
    for (const f of assist) {
      const bad = imports(f).filter((spec) => /app\//.test(spec) || /^https?:/.test(spec));
      expect(bad, relative(SRC, f)).toEqual([]);
    }
  });
});
