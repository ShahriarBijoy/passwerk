import { BatteryCategory, sha256Hex } from '@passwerk/core';
import { z } from 'zod';
import type { CreateRefusal, DownloadLimits } from '../downloads.js';
import { confirmationFor } from '../series/confirm.js';
import { DEMO_SERIES, loadSeries } from '../series/load.js';
import { runInWorker } from '../series/runner.js';
import type { ModelOutcome, ModelRun, SeriesFile, SeriesModel } from '../series/types.js';
import { zipRun } from '../series/zip.js';
import type { RequestScope, ServerDeps, TaskTool } from '../server.js';
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

/** One tool call, as every step of its run needs it. */
interface Call {
  input: Input;
  source: Source;
  deps: ServerDeps;
  scope: RequestScope;
}

/** A pass through the worker: one run per model, in order. */
interface Run {
  asOf: string;
  models: SeriesModel[];
  runs: ModelRun[];
}

/** After a question: how many held values the answers applied and left open. */
interface Asked {
  confirmed: number;
  skipped: number;
}

/** The zip of a finished run, as the result describes it. */
export interface DownloadLink {
  url: string;
  file: string;
  bytes: number;
  sha256: string;
  expiresAt: string;
}

type Download = { link: DownloadLink } | { refused: CreateRefusal; bytes: number };

const zipName = (source: Source) =>
  `passwerk-${source.kind === 'series' ? source.series : source.modelId}.zip`;

async function offerDownload({ source, deps, scope }: Call, runs: ModelRun[]): Promise<Download> {
  const bytes = zipRun(runs);
  const sha256 = await sha256Hex(bytes);
  const file = zipName(source);
  const created = deps.downloads.create(file, bytes);
  if (typeof created === 'string') return { refused: created, bytes: bytes.byteLength };
  const url = `${scope.origin}/download/${created.id}/${file}`;
  return { link: { url, file, bytes: bytes.byteLength, sha256, expiresAt: created.expiresAt } };
}

const MiB = 1024 * 1024;
const size = (bytes: number) =>
  bytes >= MiB ? `${Math.round(bytes / MiB)} MB` : `${Math.ceil(bytes / 1024)} KB`;

function downloadLine(download: Download, { ttlMs, maxZipBytes }: DownloadLimits): string {
  const minutes = `${Math.round(ttlMs / 60_000)} minutes`;
  if ('link' in download) {
    const { file, url } = download.link;
    return `Download (one use, ${minutes}): curl -fsS -o ${file} "${url}"`;
  }
  return download.refused === 'too_large'
    ? `No download: the zip of this run is ${size(download.bytes)}, more than the ${size(maxZipBytes)} one download holds.`
    : `No download: the server holds too many downloads right now; run again in ${minutes}.`;
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

/** The finished run's result. Its zip is offered only here, once the task completes. */
async function resultOf(call: Call, run: Run, ctx: JobContext, asked?: Asked): Promise<ToolResult> {
  const { input, source, deps } = call;
  const { asOf, models, runs } = run;
  ctx.signal.throwIfAborted();
  const outcomes = runs.map((r) => r.outcome);
  const download = await offerDownload(call, runs);
  const summary = [
    seriesSummary(outcomes),
    readingLine(deps, outcomes, asked),
    downloadLine(download, deps.downloads.limits),
  ].join('\n');
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
      ...('link' in download
        ? { download: download.link }
        : { download: null, downloadRefused: download.refused }),
    },
  };
}

async function firstRun({ source, input, deps }: Call, ctx: JobContext): Promise<Run> {
  const asOf = deps.clock().toISOString();
  const models = await modelsOf(source, deps);
  const runs = await runInWorker(
    { models, category: input.category, asOf, reading: deps.reading },
    ctx,
  );
  return { asOf, models, runs };
}

/**
 * The held values as questions. The models' files, readings and emitted files stay in this
 * closure, never in a result, and the resumed run rebuilds only the models that held values,
 * from their recorded readings: Jev is not asked again. Each rebuilt model replaces its first
 * run whole, emitted files included, so the zip holds every model's final files.
 */
function questionOf(call: Call, first: Run): Question | undefined {
  const held = first.runs.flatMap((r, index) =>
    r.reading && r.reading.held.length > 0
      ? [{ index, modelId: r.outcome.modelId, reading: r.reading }]
      : [],
  );
  if (held.length === 0) return undefined;
  const confirmation = confirmationFor(held, first.runs.length);
  return {
    inputRequests: confirmation.inputRequests,
    resume: (responses) => async (ctx) => {
      const readings = confirmation.readingsFor(responses);
      const models = held.map((h) => first.models[h.index] as SeriesModel);
      const reruns = await runInWorker(
        {
          models,
          category: call.input.category,
          asOf: first.asOf,
          reading: { kind: 'recorded', readings },
        },
        ctx,
      );
      const runs = [...first.runs];
      for (const [i, h] of held.entries()) {
        const rerun = reruns[i];
        if (rerun) runs[h.index] = rerun;
      }
      const asked = {
        confirmed: readings.reduce((n, r) => n + r.confirmed.length, 0),
        skipped: readings.reduce((n, r) => n + r.held.length, 0),
      };
      return resultOf(call, { ...first, runs }, ctx, asked);
    },
  };
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
    'counts with any values still held, and the size and SHA-256 of each emitted file (AAS ' +
    'JSON, AASX, HTML sheet, gap report). The summary ends with a curl command that downloads ' +
    'every file as one zip, once, within 15 minutes, with no token: run it in the current ' +
    'folder of the user, then unzip the zip or tell the user where it is.',
  inputSchema: Input,
  job: (input, deps, scope) => {
    const call = { input, source: sourceOf(input, deps), deps, scope };
    return async (ctx) => {
      const first = await firstRun(call, ctx);
      const question = input.confirm === 'ask' ? questionOf(call, first) : undefined;
      return question ?? resultOf(call, first, ctx);
    };
  },
  // An inline run has no way to ask, so it holds whatever `confirm` says.
  inline: (input, deps, scope) => {
    const call = { input, source: sourceOf(input, deps), deps, scope };
    return async (ctx) => resultOf(call, await firstRun(call, ctx), ctx);
  },
};
