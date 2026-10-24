import { createReader } from './reader.js';
import { type Cassette, JEV_MODEL, type JevOptions, jevAsk, replayAsk } from './transport.js';
import type { Reader } from './types.js';

export { createReader, POLICY, tablesOf } from './reader.js';
export { openTargets } from './targets.js';
export {
  type Cassette,
  cassetteJson,
  JEV_MODEL,
  jevAsk,
  parseCassette,
  RECORD_HINT,
  recordingAsk,
} from './transport.js';
export type { Ask, Reader, ReadingInput, ReadingResult } from './types.js';

export const jevReader = (options: JevOptions): Reader =>
  createReader(jevAsk(options), options.model);

export const replayReader = (cassette: Cassette): Reader =>
  createReader(replayAsk(cassette), cassette.model);

export function readerFromEnv(env: Record<string, string | undefined>): Reader {
  const apiKey = env['TYPESAFE_API_KEY']?.trim();
  if (!apiKey) throw new Error('AI reading is on but TYPESAFE_API_KEY is not set');
  return jevReader({ apiKey, model: JEV_MODEL });
}
