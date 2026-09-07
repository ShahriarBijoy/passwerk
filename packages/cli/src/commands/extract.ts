import { canonicalJson } from '@passwerk/core';
import { BATTERY_CATEGORIES } from '@passwerk/rules';
import { parseLang, pick, printJson, writeOut } from '../format.js';
import { invoke, toolContext } from '../invoke.js';
import { CliInputError, EXIT_USAGE } from '../io.js';
import { registerCommand } from '../program.js';

interface IngestedSummary {
  name: string;
  error?: { code: string; message: string };
}

interface Options {
  category?: string;
  out?: string;
  lang: string;
  json?: boolean;
}

registerCommand((program, io, exit) => {
  program
    .command('extract')
    .description('ingest documents and extract facts; with --category also propose mappings')
    .argument('<files...>', 'PDF, XLSX, CSV, DOCX or TXT files, or directories')
    .option('--category <category>', `propose mappings for ${BATTERY_CATEGORIES.join(', ')}`)
    .option('--out <facts.json>', 'write the facts (and proposals) as canonical JSON')
    .option('--lang <lang>', 'language of the text output: de or en', 'en')
    .option('--json', 'print the result as canonical JSON instead of text')
    .action(async (paths: string[], options: Options) => {
      const lang = parseLang(options.lang);
      if (
        options.category !== undefined &&
        !(BATTERY_CATEGORIES as readonly string[]).includes(options.category)
      ) {
        throw new CliInputError(
          `--category must be one of ${BATTERY_CATEGORIES.join(', ')}, got "${options.category}"`,
        );
      }
      const ctx = toolContext(io);
      const ingested = await invoke('ingest_documents', { paths }, ctx);
      for (const e of (ingested.structured['errors'] as { path: string; message: string }[]) ??
        []) {
        io.stderr.write(`${e.path}: ${e.message}\n`);
      }
      // A document that could not be parsed stays in the list with an error (ingest_documents
      // reports, never drops); it is not a success (PR #26 review).
      const documents = (ingested.structured['documents'] as IngestedSummary[] | undefined) ?? [];
      for (const d of documents) {
        if (d.error)
          io.stderr.write(`${d.name}: ${d.error.code}: ${d.error.message}
`);
      }
      const readable = documents.filter((d) => !d.error);
      if (ingested.isError || readable.length === 0) {
        io.stderr.write(
          `${ingested.isError ? String(ingested.structured['error']) : lang === 'de' ? 'Kein Dokument gelesen.' : 'No document read.'}\n`,
        );
        exit(EXIT_USAGE);
        return;
      }
      const facts = await invoke(
        'extract_facts',
        { bundle: { bundleId: ingested.structured['bundleId'] } },
        ctx,
      );
      if (facts.isError) {
        io.stderr.write(`${String(facts.structured['error'])}\n`);
        exit(EXIT_USAGE);
        return;
      }
      const texts = [pick(ingested.text, lang), pick(facts.text, lang)];
      let result: Record<string, unknown> = {
        bundleId: ingested.structured['bundleId'],
        documents,
        errors: ingested.structured['errors'],
        factSetId: facts.structured['factSetId'],
        facts: facts.structured['facts'],
      };
      if (options.category !== undefined) {
        const suggested = await invoke(
          'suggest_mappings',
          { facts: { factSetId: facts.structured['factSetId'] }, category: options.category },
          ctx,
        );
        if (suggested.isError) {
          io.stderr.write(`${String(suggested.structured['error'])}\n`);
          exit(EXIT_USAGE);
          return;
        }
        texts.push(pick(suggested.text, lang));
        result = {
          ...result,
          category: options.category,
          proposals: suggested.structured['proposals'],
          counts: suggested.structured['counts'],
        };
      }
      if (options.out !== undefined) {
        const target = await writeOut(
          io,
          options.out,
          new TextEncoder().encode(canonicalJson(result)),
        );
        texts.push(lang === 'de' ? `Geschrieben: ${target}` : `Wrote ${target}`);
      }
      if (options.json) printJson(io, result);
      else io.stdout.write(`${texts.join('\n')}\n`);
      exit(0);
    });
});
