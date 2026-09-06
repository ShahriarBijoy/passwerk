/**
 * @passwerk/cli: the `passwerk` command line. Adapter only (ADR D-001, D-031): every command
 * calls a tool of the server registry in-process, so the CLI presents exactly what an MCP
 * host sees. `run` takes injected io and returns the exit code; `bin.ts` wires the process.
 */
import './commands/index.js';
import type { CliIo } from './io.js';
import { runProgram } from './program.js';

export type { CreateMessage } from './chat/types.js';
export type { AnthropicFactory, CliIo, Lang, Writer } from './io.js';
export { CliInputError, EXIT_USAGE } from './io.js';
export { CLI_VERSION, PACKAGE_NAME } from './meta.js';

export function run(argv: string[], io: CliIo): Promise<number> {
  return runProgram(argv, io);
}
