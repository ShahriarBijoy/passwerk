import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/bin.ts';
import { nodeFileSystem } from '../src/fs.ts';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'passwerk-fs-'));
  writeFileSync(join(dir, 'a.txt'), 'hello');
  writeFileSync(join(dir, 'b.pdf'), 'not really');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('nodeFileSystem', () => {
  it('reads, lists, stats and writes under a root', async () => {
    const fs = nodeFileSystem(dir);
    expect(await fs.readDir(fs.resolve('.'))).toEqual(['a.txt', 'b.pdf']);
    expect(await fs.stat(fs.resolve('a.txt'))).toEqual({ kind: 'file' });
    expect(await fs.stat(fs.resolve('.'))).toEqual({ kind: 'directory' });
    expect(await fs.stat(fs.resolve('nope'))).toEqual({ kind: 'missing' });
    expect(new TextDecoder().decode(await fs.readFile(fs.resolve('a.txt')))).toBe('hello');
    await fs.writeFile(fs.join(fs.resolve('.'), 'out.bin'), new Uint8Array([1, 2, 3]));
    expect(await fs.readFile(fs.resolve('out.bin'))).toEqual(new Uint8Array([1, 2, 3]));
    expect(fs.basename(fs.resolve('a.txt'))).toBe('a.txt');
  });

  it('refuses paths that escape the root, but not without a root', () => {
    expect(() => nodeFileSystem(dir).resolve('../x')).toThrow(/outside the configured root/);
    expect(() => nodeFileSystem(dir).resolve(join(dir, '..', 'x'))).toThrow(/outside/);
    expect(() => nodeFileSystem().resolve('../x')).not.toThrow();
  });
});

describe('parseArgs', () => {
  it('parses transport flags and the root from the environment', () => {
    expect(parseArgs([], {})).toEqual({
      http: false,
      port: 3777,
      host: '127.0.0.1',
      version: false,
      help: false,
    });
    expect(parseArgs(['--http', '8080', '--host', '0.0.0.0', '--root', 'w'], {})).toMatchObject({
      http: true,
      port: 8080,
      host: '0.0.0.0',
      root: 'w',
    });
    expect(parseArgs(['--http'], { PASSWERK_ROOT: '/r' })).toMatchObject({
      http: true,
      port: 3777,
      root: '/r',
    });
    expect(() => parseArgs(['--bogus'], {})).toThrow(/Unknown argument/);
  });
});
