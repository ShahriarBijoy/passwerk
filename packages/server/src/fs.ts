/** Node file system adapter. Entry-point only: never imported by index.ts (spec section 7). */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve as resolvePath, sep } from 'node:path';
import { type FileSystemAdapter, PathOutsideRootError } from './types.js';

export function nodeFileSystem(root?: string): FileSystemAdapter {
  const base = resolvePath(root ?? process.cwd());
  const guard = root === undefined ? undefined : base;
  return {
    resolve(p) {
      const abs = resolvePath(base, p);
      if (guard !== undefined && abs !== guard && !abs.startsWith(guard + sep)) {
        throw new PathOutsideRootError(p, guard);
      }
      return abs;
    },
    join: (...parts) => join(...parts),
    basename: (p) => basename(p),
    async readFile(p) {
      const buf = await readFile(p);
      // Copy out of Node's pooled Buffer so the bytes are ArrayBuffer-backed and unshared.
      return new Uint8Array(buf);
    },
    async writeFile(p, bytes) {
      await writeFile(p, bytes);
    },
    async stat(p) {
      try {
        const s = await stat(p);
        return { kind: s.isDirectory() ? 'directory' : 'file' };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
        throw e;
      }
    },
    readDir: (p) => readdir(p),
  };
}
