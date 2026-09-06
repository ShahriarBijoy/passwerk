/**
 * `passwerk chat`: the optional demo agent loop (ADR D-002 boundary). The only command that
 * calls a model; the key comes from ANTHROPIC_API_KEY alone and the SDK is imported lazily
 * so no other command loads it.
 */
import { runAgentLoop } from '../chat/loop.js';
import { SKILL_TEXT } from '../chat/skill.js';
import type { CreateMessage } from '../chat/types.js';
import { parseLang } from '../format.js';
import { toolContext } from '../invoke.js';
import { CliInputError, type CliIo, EXIT_USAGE, type Lang } from '../io.js';
import { registerCommand } from '../program.js';

export const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TURNS = 20;
const EXIT_BOUND = 2;

interface Options {
  message: string;
  model: string;
  maxTurns: string;
  root?: string;
  lang: string;
}

function systemPrompt(lang: Lang): string {
  const addendum =
    lang === 'de'
      ? 'Du läufst in der passwerk-Kommandozeile; die Werkzeuge laufen lokal. Antworte auf Deutsch.'
      : 'You run inside the passwerk command line; the tools run locally. Answer in English.';
  return `${SKILL_TEXT}\n\n${addendum}`;
}

async function clientFor(io: CliIo, apiKey: string): Promise<CreateMessage> {
  if (io.anthropic) return io.anthropic(apiKey);
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  return (params) => client.messages.create(params);
}

const compact = (value: unknown): string => {
  const s = JSON.stringify(value);
  return s.length > 200 ? `${s.slice(0, 197)}...` : s;
};

registerCommand((program, io, exit) => {
  program
    .command('chat')
    .description('demo agent loop over the passwerk tools (needs ANTHROPIC_API_KEY)')
    .requiredOption(
      '-m, --message <text>',
      'the task, e.g. "Erstelle einen Batteriepass aus ./docs"',
    )
    .option('--model <id>', 'Anthropic model id', DEFAULT_MODEL)
    .option(
      '--max-turns <n>',
      'model turns before the loop stops (exit 2)',
      String(DEFAULT_MAX_TURNS),
    )
    .option('--root <dir>', 'restrict document paths and output to this directory')
    .option('--lang <lang>', 'de or en', 'en')
    .action(async (options: Options) => {
      const lang = parseLang(options.lang);
      const maxTurns = Number(options.maxTurns);
      if (!Number.isInteger(maxTurns) || maxTurns < 1) {
        throw new CliInputError(
          `--max-turns must be a positive integer, got "${options.maxTurns}"`,
        );
      }
      const apiKey = io.env['ANTHROPIC_API_KEY'];
      if (!apiKey) {
        io.stderr.write('passwerk chat needs ANTHROPIC_API_KEY in the environment.\n');
        exit(EXIT_USAGE);
        return;
      }
      const ctx = toolContext(io);
      if (options.root !== undefined) {
        if (!io.rootedFs) throw new CliInputError('--root is not available in this environment');
        ctx.fs = io.rootedFs(options.root);
      }
      const createMessage = await clientFor(io, apiKey);
      const result = await runAgentLoop({
        createMessage,
        model: options.model,
        system: systemPrompt(lang),
        message: options.message,
        maxTurns,
        ctx,
        lang,
        onEvent: (e) => {
          if (e.kind === 'text') io.stdout.write(`${e.text}\n`);
          else if (e.kind === 'call') io.stdout.write(`→ ${e.name} ${compact(e.input)}\n`);
          else io.stdout.write(`← ${e.name}: ${e.summary.split('\n')[0] ?? ''}\n`);
        },
      });
      if (result.status === 'bound') {
        io.stderr.write(`Stopped after ${result.turns} turns (--max-turns).\n`);
        exit(EXIT_BOUND);
        return;
      }
      exit(0);
    });
});
