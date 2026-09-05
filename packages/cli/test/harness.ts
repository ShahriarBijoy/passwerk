import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryFileSystem } from '../../server/test/harness.ts';
import type { CliIo } from '../src/io.ts';

export const TEST_CLOCK = '2026-09-06T12:00:00Z';

export const ROOT = join(import.meta.dirname, '..', '..', '..');
export const SAMPLES = join(ROOT, 'packages', 'core', 'src', 'samples');
export const MUSTERWERK = join(ROOT, 'packages', 'core', 'test', 'fixtures', 'musterwerk');

export const MUSTERWERK_NAMES = [
  'lieferantenerklaerung.pdf',
  'stueckliste.xlsx',
  'energierechnung.pdf',
  'datasheet-en.csv',
  'handover-notes.docx',
] as const;

/** Golden sample JSON files keyed by `/work/samples/<name>.json`. */
export function sampleFiles(): Record<string, Uint8Array<ArrayBuffer>> {
  const names = [
    'ev-valid',
    'lmt-valid',
    'industrial-valid',
    'ev-missing-material-identifier',
    'lmt-wrong-date-format',
    'lmt-missing-state-of-charge',
    'industrial-bad-decimal',
    'ev-document-without-classification',
  ];
  return Object.fromEntries(
    names.map((n) => [
      `/work/samples/${n}.json`,
      new Uint8Array(readFileSync(join(SAMPLES, `${n}.json`))),
    ]),
  );
}

/** Musterwerk fixtures keyed by `/work/docs/<name>`. */
export function musterwerkFiles(): Record<string, Uint8Array<ArrayBuffer>> {
  return Object.fromEntries(
    MUSTERWERK_NAMES.map((n) => [
      `/work/docs/${n}`,
      new Uint8Array(readFileSync(join(MUSTERWERK, n))),
    ]),
  );
}

export interface CaptureIo extends CliIo {
  out(): string;
  err(): string;
  fs: ReturnType<typeof memoryFileSystem>;
}

export function captureIo(
  files: Record<string, Uint8Array<ArrayBuffer>> = {},
  options: Partial<Pick<CliIo, 'env' | 'anthropic' | 'rootedFs' | 'clock'>> = {},
): CaptureIo {
  const out: string[] = [];
  const err: string[] = [];
  const fs = memoryFileSystem(files);
  return {
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    fs,
    env: options.env ?? {},
    clock: options.clock ?? TEST_CLOCK,
    ...(options.anthropic ? { anthropic: options.anthropic } : {}),
    ...(options.rootedFs ? { rootedFs: options.rootedFs } : {}),
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

export const utf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
