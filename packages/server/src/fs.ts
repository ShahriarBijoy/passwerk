/**
 * Node file system adapter. Entry-point only: never imported by index.ts (spec section 7).
 *
 * With a root configured, `resolve` is only the lexical gate. Every operation canonicalises
 * its target with `realpath` (symlinks followed) and checks the result against the canonical
 * root, so a link inside the root cannot read or write outside it (PR #25 review, P1). Writes
 * additionally refuse a target that is itself a symlink, and create missing folders only after
 * the nearest folder that already exists canonicalises inside the root, so a link above a new
 * folder cannot make `mkdir` create folders outside it (ADR D-045).
 */
import { realpathSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve as resolvePath, sep } from 'node:path';
import { type FileSystemAdapter, PathOutsideRootError } from './types.js';

const isEnoent = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === 'ENOENT';

export function nodeFileSystem(root?: string): FileSystemAdapter {
  const base = resolvePath(root ?? process.cwd());
  const guard = root === undefined ? undefined : base;
  // The canonical root; falls back to the lexical one when the directory does not exist yet.
  // `.native` matters: the JS `realpathSync` keeps Windows 8.3 short names (RUNNER~1) while
  // `fs.promises.realpath` expands them, and the two must agree for `within` to hold.
  const realRoot = (() => {
    if (guard === undefined) return undefined;
    try {
      return realpathSync.native(guard);
    } catch {
      return guard;
    }
  })();

  const within = (abs: string, canonicalRoot: string): boolean =>
    abs === canonicalRoot || abs.startsWith(canonicalRoot + sep);

  const lexical = (p: string): string => {
    const abs = resolvePath(base, p);
    if (guard !== undefined && !within(abs, guard)) throw new PathOutsideRootError(p, guard);
    return abs;
  };

  /** Canonical path of an existing target, checked against the canonical root. */
  const canonical = async (p: string): Promise<string> => {
    const abs = lexical(p);
    if (realRoot === undefined) return abs;
    const real = await realpath(abs);
    if (!within(real, realRoot)) throw new PathOutsideRootError(p, realRoot);
    return real;
  };

  /** The deepest folder on the way from `dir` up to the file system root that exists. */
  const nearestExisting = async (dir: string): Promise<string> => {
    let current = dir;
    for (;;) {
      try {
        await lstat(current);
        return current;
      } catch (e) {
        if (!isEnoent(e)) throw e;
        const up = dirname(current);
        if (up === current) return current;
        current = up;
      }
    }
  };

  const assertWithin = async (dir: string, p: string, canonicalRoot: string): Promise<void> => {
    if (!within(await realpath(dir), canonicalRoot))
      throw new PathOutsideRootError(p, canonicalRoot);
  };

  return {
    resolve: lexical,
    join: (...parts) => join(...parts),
    basename: (p) => basename(p),
    relative: (p) => {
      const rel = relative(base, lexical(p)).split(sep).join('/');
      return rel === '' ? '.' : rel;
    },
    async readFile(p) {
      const buf = await readFile(await canonical(p));
      // Copy out of Node's pooled Buffer so the bytes are ArrayBuffer-backed and unshared.
      return new Uint8Array(buf);
    },
    async writeFile(p, bytes) {
      const abs = lexical(p);
      const parent = dirname(abs);
      if (realRoot !== undefined) {
        await assertWithin(await nearestExisting(parent), p, realRoot);
        await mkdir(parent, { recursive: true });
        await assertWithin(parent, p, realRoot);
        try {
          if ((await lstat(abs)).isSymbolicLink()) throw new PathOutsideRootError(p, realRoot);
        } catch (e) {
          if (!isEnoent(e)) throw e;
        }
      } else {
        await mkdir(parent, { recursive: true });
      }
      await writeFile(abs, bytes);
    },
    async stat(p) {
      let target: string;
      try {
        target = await canonical(p);
      } catch (e) {
        if (isEnoent(e)) return { kind: 'missing' };
        throw e;
      }
      try {
        const s = await stat(target);
        return { kind: s.isDirectory() ? 'directory' : 'file' };
      } catch (e) {
        if (isEnoent(e)) return { kind: 'missing' };
        throw e;
      }
    },
    readDir: async (p) => readdir(await canonical(p)),
  };
}
