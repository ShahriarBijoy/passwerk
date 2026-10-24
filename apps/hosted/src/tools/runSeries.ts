import { BatteryCategory } from '@passwerk/core';
import { z } from 'zod';
import { confirmationFor } from '../series/confirm.js';
import { DEMO_SERIES, loadSeries } from '../series/load.js';
import { runInWorker } from '../series/runner.js';
import type { ModelOutcome, ModelRun, SeriesFile, SeriesModel } from '../series/types.js';
import type { ServerDeps, TaskTool } from '../server.js';
import type { JobContext, Question, ToolResult } from '../tasks.js';
import { isFileName, type TakeRefusal } from '../uploads.js';

/** Decoded bytes of every inline document together. */
export const MAX_INLINE_BYTES = 1024 * 1024;
const MAX_INLINE_DOCUMENTS = 20;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const isBase64 = (s: string) => s.length % 4 === 0 && BASE64.test(s);

const decodedLength = (b64: string) =>
  (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

const FileName = z.string().refine(isFileName, {
  message:
    'file name: letters, digits, dot, dash, underscore and space, 1 to 100 characters, no ' +
    'leading dot, extension .pdf .xlsx .docx .csv or .txt',
});

const Document = z.object({
  name: FileName,
  contentBase64: z
    .string()
    .max(Math.ceil(MAX_INLINE_BYTES / 3) * 4)
    .refine(isBase64, 'contentBase64 must be standard padded base64'),
});

const ModelId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'modelId: letters, digits, dot, dash, underscore');

const Input = z
  .object({
    series: z.enum(DEMO_SERIES).optional().describe('A demo series held on the server.'),
    upload: z.string().max(64).optional().describe('An uploadId from create_upload.'),
    documents: z
      .array(Document)
      .min(1)
      .max(MAX_INLINE_DOCUMENTS)
      .optional()
      .describe('Inline documents for hosts without a shell, at most 1 MB decoded in all.'),
    category: BatteryCategory,
    modelId: ModelId.optional().describe('Model id for upload or documents. Default "upload".'),
    confirm: z
      .enum(['ask', 'hold'])
      .default('ask')
      .describe(
        'What to do with values the AI reading held: "ask" the user in a dialog (interactive ' +
          'sessions), or "hold" them in the result (`claude -p`, Agent SDK). Default "ask".',
      ),
  })
  .superRefine((input, ctx) => {
    const sources = [input.series, input.upload, input.documents].filter((s) => s !== undefined);
    if (sources.length !== 1) {
      ctx.addIssue({ code: 'custom', message: 'give exactly one of series, upload, documents' });
    }
    if (input.series !== undefined && input.modelId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['modelId'],
        message: 'modelId needs upload or documents',
      });
    }
    if (input.documents === undefined) return;
    const names = new Set(input.documents.map((d) => d.name));
    if (names.size !== input.documents.length) {
      ctx.addIssue({ code: 'custom', path: ['documents'], message: 'document names must differ' });
    }
    const total = input.documents.reduce((n, d) => n + decodedLength(d.contentBase64), 0);
    if (total > MAX_INLINE_BYTES) {
      ctx.addIssue({
        code: 'custom',
        path: ['documents'],
        message: `documents decode to ${total} bytes; at most ${MAX_INLINE_BYTES}. Use create_upload instead.`,
      });
    }
  });

type Input = z.infer<typeof Input>;

/** Where the documents of one run come from, parsed once at the tool boundary. */
type Source =
  | { kind: 'series'; series: (typeof DEMO_SERIES)[number] }
  | { kind: 'upload'; uploadId: string; modelId: string }
  | { kind: 'documents'; files: SeriesFile[]; modelId: string };

const DEFAULT_MODEL_ID = 'upload';

const TAKE_MESSAGES: Record<TakeRefusal, string> = {
  not_found: 'Unknown, expired or already used upload. Call create_upload for a new one.',
  busy: 'Files are still being uploaded to this slot; wait for every PUT to finish.',
  empty: 'No file was uploaded to this slot yet; PUT the files first.',
};

function sourceOf(input: Input, { uploads }: ServerDeps): Source {
  const modelId = input.modelId ?? DEFAULT_MODEL_ID;
  if (input.series !== undefined) return { kind: 'series', series: input.series };
  if (input.upload !== undefined) {
    const refusal = uploads.check(input.upload);
    if (refusal !== undefined) throw new Error(TAKE_MESSAGES[refusal]);
    return { kind: 'upload', uploadId: input.upload, modelId };
  }
  const files = (input.documents ?? []).map((d) => ({
    name: d.name,
    bytes: new Uint8Array(Buffer.from(d.contentBase64, 'base64')),
  }));
  return { kind: 'documents', files, modelId };
}

async function modelsOf(
  source: Source,
  { seriesDir, uploads }: ServerDeps,
): Promise<SeriesModel[]> {
  switch (source.kind) {
    case 'series':
      return loadSeries(seriesDir, source.series);
    case 'upload': {
      // Taken when the run starts, so a refused task start leaves the slot usable.
      const files = uploads.take(source.uploadId);
      if (typeof files === 'string') throw new Error(TAKE_MESSAGES[files]);
      return [{ modelId: source.modelId, files }];
    }
    case 'documents':
      return [{ modelId: source.modelId, files: source.files }];
  }
}

const VERDICTS = ['valid', 'valid_with_warnings', 'invalid'] as const;

export function seriesSummary(models: ModelOutcome[]): string {
  const count = (v: string) => models.filter((m) => m.verdict === v).length;
  const head = `${models.length} models: ${VERDICTS.map((v) => `${count(v)} ${v}`).join(', ')}`;
  const lines = models.map(
    (m) =>
      `${m.modelId}: ${m.verdict}, ${m.facts} facts, ${m.mapped} mapped, ${m.conflicts} conflicts, mandatory ${m.gap.mandatoryCompleteness} %`,
  );
  return [head, ...lines].join('\n');
}

/** What the first pass through the worker left: the result is built from it, or a question. */
interface FirstRun {
  asOf: string;
  models: SeriesModel[];
  runs: ModelRun[];
}

/** After a question: how many held values the answers applied and left open. */
interface Asked {
  confirmed: number;
  skipped: number;
}

function readingLine(deps: ServerDeps, outcomes: ModelOutcome[], asked?: Asked): string {
  if (deps.reading.kind === 'off') return 'AI reading: off';
  const applied = outcomes.reduce((n, m) => n + (m.reading?.applied ?? 0), 0);
  const held = outcomes.reduce((n, m) => n + (m.reading?.toConfirm.length ?? 0), 0);
  const rest = asked
    ? `${asked.confirmed} confirmed, ${asked.skipped} skipped`
    : `${held} held for confirmation`;
  return `AI reading: on, ${applied} applied, ${rest}`;
}

function resultOf(
  input: Input,
  source: Source,
  deps: ServerDeps,
  run: { asOf: string; models: SeriesModel[]; outcomes: ModelOutcome[] },
  asked?: Asked,
): ToolResult {
  const { asOf, models, outcomes } = run;
  const summary = `${seriesSummary(outcomes)}
${readingLine(deps, outcomes, asked)}`;
  const origin =
    source.kind === 'series'
      ? { series: source.series }
      : { documents: models.flatMap((m) => m.files.map((f) => f.name)) };
  return {
    content: [{ type: 'text', text: summary }],
    // Claude Code hands the model this object, not `content`, for a task result.
    structuredContent: {
      summary,
      source: source.kind,
      ...origin,
      category: input.category,
      asOf,
      reading: deps.reading.kind === 'off' ? 'off' : 'on',
      models: outcomes,
    },
  };
}

async function firstRun(source: Source, input: Input, deps: ServerDeps, ctx: JobContext) {
  const asOf = deps.clock().toISOString();
  const models = await modelsOf(source, deps);
  const runs = await runInWorker(
    { models, category: input.category, asOf, reading: deps.reading },
    ctx,
  );
  return { asOf, models, runs };
}

const finished = (run: FirstRun) => ({ ...run, outcomes: run.runs.map((r) => r.outcome) });

/**
 * The held values as questions. The models' files and readings stay in this closure, never in
 * a result, and the resumed run rebuilds only the models that held values, from their recorded
 * readings: Jev is not asked again.
 */
function questionOf(first: FirstRun, source: Source, input: Input, deps: ServerDeps) {
  const held = first.runs.flatMap((r, index) =>
    r.reading && r.reading.held.length > 0
      ? [{ index, modelId: r.outcome.modelId, reading: r.reading }]
      : [],
  );
  if (held.length === 0) return undefined;
  const confirmation = confirmationFor(held, first.runs.length);
  const question: Question = {
    inputRequests: confirmation.inputRequests,
    resume: (responses) => async (ctx) => {
      const readings = confirmation.readingsFor(responses);
      const models = held.map((h) => first.models[h.index] as SeriesModel);
      const reruns = await runInWorker(
        {
          models,
          category: input.category,
          asOf: first.asOf,
          reading: { kind: 'recorded', readings },
        },
        ctx,
      );
      const outcomes = first.runs.map((r) => r.outcome);
      for (const [i, h] of held.entries()) {
        const rerun = reruns[i];
        if (rerun) outcomes[h.index] = rerun.outcome;
      }
      const asked = {
        confirmed: readings.reduce((n, r) => n + r.confirmed.length, 0),
        skipped: readings.reduce((n, r) => n + r.held.length, 0),
      };
      return resultOf(input, source, deps, { ...first, outcomes }, asked);
    },
  };
  return question;
}

export const runSeries: TaskTool<typeof Input> = {
  name: 'run_series',
  description:
    'Run battery models as one MCP task: every model goes through ingest, extract, suggest, ' +
    'apply, validate and emit. Give exactly one source: `series` (a demo series on the server), ' +
    '`upload` (an uploadId from create_upload, after the files were PUT; all its files are one ' +
    'model) or `documents` (inline base64 files, at most 1 MB in all, only for hosts without a ' +
    'shell). When the server reads documents with AI, values it is not sure enough to apply on ' +
    'its own are held. With `confirm: "ask"` (the default) the task asks the user about them in ' +
    'a dialog before it finishes; use `confirm: "hold"` in non-interactive sessions (`claude -p`, ' +
    'the Agent SDK), where a question cancels the task, to finish at once and report the held ' +
    'values instead. The result holds per model the verdict from the validators, fact, mapping ' +
    'and conflict counts, mandatory completeness, missing mandatory attributes, the AI reading ' +
    'counts with any values still held, and the SHA-256 of each emitted artefact (AAS JSON, ' +
    'AASX, HTML sheet, gap report).',
  inputSchema: Input,
  job: (input, deps) => {
    const source = sourceOf(input, deps);
    return async (ctx) => {
      const first = await firstRun(source, input, deps, ctx);
      const question = input.confirm === 'ask' ? questionOf(first, source, input, deps) : undefined;
      return question ?? resultOf(input, source, deps, finished(first));
    };
  },
  // An inline run has no way to ask, so it holds whatever `confirm` says.
  inline: (input, deps) => {
    const source = sourceOf(input, deps);
    return async (ctx) =>
      resultOf(input, source, deps, finished(await firstRun(source, input, deps, ctx)));
  },
};
