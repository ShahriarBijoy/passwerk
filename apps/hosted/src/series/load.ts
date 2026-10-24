/**
 * Reads a demo series from the server's series directory. Only names on the allowlist resolve,
 * so a tool argument never becomes an arbitrary path.
 */
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { SeriesFile, SeriesModel } from './types.js';

/** Series the server offers, generated into `demo/series` by `pnpm series`. */
export const DEMO_SERIES = ['musterwerk', 'musterwerk-12', 'musterwerk-complete'] as const;
export type DemoSeries = (typeof DEMO_SERIES)[number];

const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.xlsx', '.docx', '.csv', '.txt']);
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_MODELS = 50;

export class UnknownSeriesError extends Error {}

export function isDemoSeries(name: string): name is DemoSeries {
  return (DEMO_SERIES as readonly string[]).includes(name);
}

async function readModel(dir: string, modelId: string): Promise<SeriesModel> {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile() && DOCUMENT_EXTENSIONS.has(extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
  const files: SeriesFile[] = [];
  for (const name of names) {
    const bytes = new Uint8Array(await readFile(join(dir, name)));
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new Error(`${modelId}/${name} exceeds ${MAX_FILE_BYTES} bytes`);
    }
    files.push({ name, bytes });
  }
  if (files.length === 0) throw new Error(`model ${modelId} has no supported documents`);
  return { modelId, files };
}

/**
 * A series is a folder under `root`. Subfolders are its models, sorted by name; a folder
 * without subfolders is a single model named after the series.
 */
export async function loadSeries(root: string, series: string): Promise<SeriesModel[]> {
  if (!isDemoSeries(series)) {
    throw new UnknownSeriesError(`Unknown series "${series}". Known: ${DEMO_SERIES.join(', ')}`);
  }
  const dir = join(root, series);
  const entries = await readdir(dir, { withFileTypes: true });
  const subdirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (subdirs.length === 0) return [await readModel(dir, series)];
  if (subdirs.length > MAX_MODELS) throw new Error(`${series} has more than ${MAX_MODELS} models`);
  const models: SeriesModel[] = [];
  for (const modelId of subdirs) models.push(await readModel(join(dir, modelId), modelId));
  return models;
}
