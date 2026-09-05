import {
  findingLines,
  parseLang,
  printJson,
  verdictExit,
  verdictLine,
  withOutputOptions,
} from '../format.js';
import { EXIT_USAGE } from '../io.js';
import { registerCommand } from '../program.js';
import { invokeOnDraft } from './draft.js';

interface Options {
  asOf?: string;
  lang: string;
  json?: boolean;
}

registerCommand((program, io, exit) => {
  withOutputOptions(
    program
      .command('audit')
      .description('validate a PassportDraft JSON file on all four layers (exit 0/1/2 by verdict)')
      .argument('<draft.json>', 'the PassportDraft file')
      .option('--as-of <iso>', 'ISO date-time treated as "now" by the plausibility layer'),
  ).action(async (path: string, options: Options) => {
    const lang = parseLang(options.lang);
    const { result, verdict, findings } = await invokeOnDraft(io, 'validate_passport', path, {
      ...(options.asOf !== undefined ? { asOf: options.asOf } : {}),
    });
    if (verdict === undefined) {
      io.stderr.write(`${String(result.structured['error'])}\n`);
      exit(EXIT_USAGE);
      return;
    }
    if (options.json) {
      printJson(io, { ...result.structured, verdict, findings });
    } else {
      io.stdout.write(
        `${[verdictLine(verdict, findings, lang), ...findingLines(findings, lang)].join('\n')}\n`,
      );
    }
    exit(verdictExit(verdict));
  });
});
