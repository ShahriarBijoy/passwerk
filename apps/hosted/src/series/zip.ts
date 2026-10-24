import { type ZipOptions, type Zippable, zipSync } from 'fflate';
import type { ModelResult } from './types.js';

/**
 * Stored, not deflated: the zip is built on the main thread, where deflating a sixty-model run
 * held polls for about half a second and storing it for about 60 ms (ADR D-050). fflate writes
 * the local-time fields of `mtime`, so a date built from local fields gives the same bytes in
 * every time zone.
 */
const FIXED: ZipOptions = { level: 0, mtime: new Date(1980, 0, 1) };

/**
 * Every model's files under `<modelId>/`, in run order and then in the order the pipeline emits
 * them, with fixed entry times: the same run gives the same bytes.
 */
export function zipRun(results: readonly ModelResult[]): Uint8Array {
  const entries: Zippable = {};
  for (const { outcome, files } of results) {
    for (const { file, bytes } of files) entries[`${outcome.modelId}/${file}`] = [bytes, FIXED];
  }
  return zipSync(entries, FIXED);
}
