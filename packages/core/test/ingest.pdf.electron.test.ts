import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestMusterwerkPdfs, MUSTERWERK_PDF_GOLDEN } from './helpers/musterwerkPdfs.js';

/**
 * Claude Desktop runs a local extension in its built-in Node, an Electron utility process:
 * `process.versions.electron` is set and `process.type` is `'utility'`. pdfjs-dist decides
 * once, at module load, that such a process is a browser and then demands a worker script.
 * This file stays on its own so pdfjs is first imported after the simulation below
 * (`readPdf` loads it lazily, and Vitest isolates test files).
 */
const previousType = Object.getOwnPropertyDescriptor(process, 'type');

beforeAll(() => {
  expect(process.versions['electron']).toBeUndefined();
  Object.defineProperty(process.versions, 'electron', { value: '38.0.0', configurable: true });
  Object.defineProperty(process, 'type', { value: 'utility', configurable: true, writable: true });
});

afterAll(() => {
  Reflect.deleteProperty(process.versions, 'electron');
  if (previousType) Object.defineProperty(process, 'type', previousType);
  else Reflect.deleteProperty(process, 'type');
});

describe('pdf reader inside an Electron utility process (Claude Desktop)', () => {
  it('reads the Musterwerk PDFs exactly as plain Node does', async () => {
    const { errors, json } = await ingestMusterwerkPdfs();
    expect(errors).toEqual([]);
    await expect(json).toMatchFileSnapshot(MUSTERWERK_PDF_GOLDEN);
  });
});
