import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) =>
    statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)],
  );
const imports = (f: string): string[] =>
  [...readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');

/**
 * Spec section 4.6: the MCP App may reuse the web app's `views`, `workflow`, `i18n`,
 * `components`, `lib` and the shell (`app/App`, `app/clock`, `app/ErrorBoundary`,
 * `app/useStore`, `app/platform` types). It must never reach IndexedDB, the anchor download
 * or Node: the iframe cannot use them.
 */
const FORBIDDEN = [
  /app\/(persistence|download)\.ts$/,
  /web\/src\/main\.tsx$/,
  /^@\/main\.tsx$/,
  /^idb-keyval/,
  /^node:/,
];

describe('mcp-app import boundary (spec section 4.6)', () => {
  const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
  it('has the shell files', () => {
    expect(files.map((f) => relative(SRC, f).replace(/\\/g, '/'))).toEqual(
      expect.arrayContaining(['bridge.ts', 'host.ts', 'main.tsx']),
    );
  });
  for (const f of files) {
    it(`${relative(SRC, f)} never reaches IndexedDB, the anchor download or node`, () => {
      expect(imports(f).filter((s) => FORBIDDEN.some((r) => r.test(s)))).toEqual([]);
    });
  }
});
