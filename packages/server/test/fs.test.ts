import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSample } from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/bin.ts';
import { nodeFileSystem } from '../src/fs.ts';
import { call, connect } from './harness.ts';

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

  it('names files relative to the root with forward slashes', () => {
    const fs = nodeFileSystem(dir);
    expect(fs.relative(fs.resolve('a.txt'))).toBe('a.txt');
    expect(fs.relative(fs.join(fs.resolve('.'), 'sub', 'x.pdf'))).toBe('sub/x.pdf');
    expect(fs.relative(fs.resolve('.'))).toBe('.');
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

describe('nodeFileSystem: symlinks cannot escape the root (PR #25 review, P1)', () => {
  let base: string;
  let root: string;
  let outside: string;
  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'passwerk-link-'));
    root = join(base, 'root');
    outside = join(base, 'outside');
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.txt'), 'Capacity: 80 Ah');
    // A junction needs no elevated rights on Windows; elsewhere it is a directory symlink.
    symlinkSync(outside, join(root, 'link'), 'junction');
  });
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it('reads, stats, listings and writes through a link are refused under a root', async () => {
    const fs = nodeFileSystem(root);
    const target = fs.resolve('link/secret.txt');
    await expect(fs.readFile(target)).rejects.toThrow(/outside the configured root/);
    await expect(fs.stat(target)).rejects.toThrow(/outside the configured root/);
    await expect(fs.readDir(fs.resolve('link'))).rejects.toThrow(/outside the configured root/);
    await expect(
      fs.writeFile(fs.join(fs.resolve('link'), 'out.txt'), new Uint8Array([1])),
    ).rejects.toThrow(/outside the configured root/);
    expect(existsSync(join(outside, 'out.txt'))).toBe(false);
  });

  it('the same reads work without a root', async () => {
    const fs = nodeFileSystem();
    const text = await fs.readFile(join(root, 'link', 'secret.txt'));
    expect(new TextDecoder().decode(text)).toBe('Capacity: 80 Ah');
  });

  it('ingest_documents and emit_passport report the escape instead of following it', async () => {
    const session = await connect({ fs: nodeFileSystem(root) });
    try {
      const ing = await call<{ documents: unknown[]; errors: { path: string; message: string }[] }>(
        session.client,
        'ingest_documents',
        { paths: ['link/secret.txt', 'link'] },
      );
      expect(ing.isError).toBe(false);
      expect(ing.structured.documents).toEqual([]);
      expect(ing.structured.errors.map((e) => e.path)).toEqual(['link/secret.txt', 'link']);
      expect(ing.structured.errors[0]?.message).toMatch(/outside the configured root/);
      const emit = await call(session.client, 'emit_passport', {
        draft: getSample('ev-valid'),
        targets: ['draft-json'],
        outDir: 'link',
      });
      expect(emit.isError).toBe(true);
      expect(emit.text).toMatch(/outside the configured root/);
      expect(readdirSync(outside)).toEqual(['secret.txt']);
    } finally {
      await session.close();
    }
  });
});
