import type { Finding, Verdict } from '@passwerk/core';
import {
  findingLines,
  parseLang,
  printJson,
  readJsonFile,
  verdictExit,
  verdictLine,
  withOutputOptions,
} from '../format.js';
import { invoke, toolContext } from '../invoke.js';
import { EXIT_USAGE } from '../io.js';
import { registerCommand } from '../program.js';

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
    const draft = await readJsonFile(io, path);
    const r = await invoke(
      'validate_passport',
      { draft, ...(options.asOf !== undefined ? { asOf: options.asOf } : {}) },
      toolContext(io),
    );
    const findings = (r.structured['findings'] as Finding[] | undefined) ?? [];
    if (r.isError && findings.length === 0) {
      io.stderr.write(`${String(r.structured['error'])}\n`);
      exit(EXIT_USAGE);
      return;
    }
    // A structurally invalid draft (L1) arrives as an error carrying findings: still a verdict.
    const verdict = (r.structured['verdict'] as Verdict | undefined) ?? 'invalid';
    if (options.json) {
      printJson(io, { ...r.structured, verdict, findings });
    } else {
      io.stdout.write(
        `${[verdictLine(verdict, findings, lang), ...findingLines(findings, lang)].join('\n')}\n`,
      );
    }
    exit(verdictExit(verdict));
  });
});
