import { Command, CommanderError } from 'commander';
import { CliInputError, type CliIo, EXIT_USAGE } from './io.js';
import { CLI_VERSION } from './meta.js';

/** A command receives the parsed options and returns the process exit code. */
export type CommandRunner = (program: Command, io: CliIo, exit: (code: number) => void) => void;

const registrars: CommandRunner[] = [];

/** Commands register themselves here; `index.ts` imports each module for its side effect. */
export function registerCommand(r: CommandRunner): void {
  registrars.push(r);
}

export async function runProgram(argv: string[], io: CliIo): Promise<number> {
  let code = 0;
  const exit = (c: number) => {
    code = c;
  };
  const program = new Command('passwerk')
    .description('EU battery passport toolkit: audit, extract, emit, gaps, obligations. Offline.')
    .version(CLI_VERSION)
    .exitOverride()
    .configureOutput({
      writeOut: (s) => io.stdout.write(s),
      writeErr: (s) => io.stderr.write(s),
    });
  for (const r of registrars) r(program, io, exit);
  if (argv.length === 0) {
    io.stderr.write(program.helpInformation());
    return EXIT_USAGE;
  }
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (e) {
    if (e instanceof CommanderError) {
      // Help and version are printed by commander and are not errors.
      return e.exitCode === 0 ? 0 : EXIT_USAGE;
    }
    if (e instanceof CliInputError) {
      io.stderr.write(`${e.message}\n`);
      return EXIT_USAGE;
    }
    throw e;
  }
  return code;
}
