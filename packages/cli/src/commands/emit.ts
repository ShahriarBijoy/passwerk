import { findingLines, parseLang, printJson, verdictExit, withOutputOptions } from '../format.js';
import { CliInputError, EXIT_USAGE } from '../io.js';
import { registerCommand } from '../program.js';
import { invokeOnDraft } from './draft.js';

const TARGETS = ['aas-json', 'aasx', 'draft-json'] as const;
type Target = (typeof TARGETS)[number];

interface Options {
  out: string;
  targets: string;
  asOf?: string;
  lang: string;
  json?: boolean;
}

interface EmittedFile {
  target: Target;
  name: string;
  size: number;
  path?: string;
}

function parseTargets(value: string): Target[] {
  const targets = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  for (const t of targets) {
    if (!(TARGETS as readonly string[]).includes(t)) {
      throw new CliInputError(`--targets: unknown target "${t}" (allowed: ${TARGETS.join(', ')})`);
    }
  }
  if (targets.length === 0) throw new CliInputError('--targets: at least one target is required');
  return targets as Target[];
}

registerCommand((program, io, exit) => {
  withOutputOptions(
    program
      .command('emit')
      .description('write the passport files (AAS JSON, AASX, draft JSON) and re-validate them')
      .argument('<draft.json>', 'the PassportDraft file')
      .requiredOption('--out <dir>', 'directory to write into')
      .option('--targets <list>', `comma-separated: ${TARGETS.join(', ')}`, TARGETS.join(','))
      .option('--as-of <iso>', 'ISO date-time treated as "now" by the re-validation'),
  ).action(async (path: string, options: Options) => {
    const lang = parseLang(options.lang);
    const targets = parseTargets(options.targets);
    const { result, verdict, findings } = await invokeOnDraft(io, 'emit_passport', path, {
      targets,
      outDir: options.out,
      ...(options.asOf !== undefined ? { asOf: options.asOf } : {}),
    });
    if (verdict === undefined) {
      io.stderr.write(`${String(result.structured['error'])}\n`);
      exit(EXIT_USAGE);
      return;
    }
    const files = (result.structured['files'] as EmittedFile[] | undefined) ?? [];
    if (options.json) {
      printJson(io, { ...result.structured, verdict, findings, files });
    } else {
      const head =
        lang === 'de'
          ? `Ergebnis der Nachvalidierung: ${verdict}. ${files.length} Datei(en) geschrieben.`
          : `Re-validation verdict: ${verdict}. Wrote ${files.length} file(s).`;
      const lines = [
        head,
        ...files.map((f) => `- ${f.target}: ${f.path ?? f.name} (${f.size} bytes)`),
        ...findingLines(findings, lang),
      ];
      io.stdout.write(`${lines.join('\n')}\n`);
    }
    exit(verdictExit(verdict));
  });
});
