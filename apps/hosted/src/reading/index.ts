import { createReader } from './reader.js';
import { type Cassette, JEV_MODEL, type JevOptions, jevAsk, replayAsk } from './transport.js';
import type { Reader, ReadingResult } from './types.js';

export { createReader, POLICY, slotKey, tablesOf } from './reader.js';
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
export type { Ask, HeldValue, Reader, ReadingInput, ReadingResult } from './types.js';

export const jevReader = (options: JevOptions): Reader =>
  createReader(jevAsk(options), options.model);

export const replayReader = (cassette: Cassette): Reader =>
  createReader(replayAsk(cassette), cassette.model);

/**
 * Gives back a reading recorded earlier, without asking Jev again. The draft it rebuilds is the
 * same as long as the documents and the accept policy are.
 */
export const recordedReader = (recorded: ReadingResult): Reader => ({
  read: async () => recorded,
});

export function readerFromEnv(env: Record<string, string | undefined>): Reader {
  const apiKey = env['TYPESAFE_API_KEY']?.trim();
  if (!apiKey) throw new Error('AI reading is on but TYPESAFE_API_KEY is not set');
  return jevReader({ apiKey, model: JEV_MODEL });
}
