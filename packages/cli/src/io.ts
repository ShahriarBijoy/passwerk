/**
 * Everything the CLI touches outside its own process is injected here (spec section 5), so
 * tests call commands in-process with captured streams and an in-memory file system, and
 * `bin.ts` is the only file that reads the real process.
 */
import type { FileSystemAdapter } from '@passwerk/server';
import type { CreateMessage } from './chat/types.js';

export interface Writer {
  write(chunk: string): unknown;
}

/** Builds the Anthropic call for `chat` from the key. Tests inject a scripted fake. */
export type AnthropicFactory = (apiKey: string) => CreateMessage;

export interface CliIo {
  stdout: Writer;
  stderr: Writer;
  fs: FileSystemAdapter;
  /** A file system restricted to `root`, for `chat --root`. Absent in environments without one. */
  rootedFs?: (root: string) => FileSystemAdapter;
  env: Record<string, string | undefined>;
  /** ISO date-time used as "now" where a command gives none. The only wall-clock input. */
  clock: string;
  anthropic?: AnthropicFactory;
}

export type Lang = 'de' | 'en';

export const EXIT_USAGE = 3;

/** Raised by a command for unreadable input or a usage error; `run` maps it to exit 3. */
export class CliInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliInputError';
  }
}
