import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type HostedHandle, startHosted } from '../src/http.js';
import { liveWorkers, runInWorker, type WorkerEntry } from '../src/series/runner.js';
import type { SeriesModel, WorkerStart } from '../src/series/types.js';
import { client, TOKEN } from './rpc.js';

const SERIES = fileURLToPath(new URL('../../../demo/series', import.meta.url));
const AS_OF = '2026-10-24T12:00:00.000Z';
const VERDICTS = ['valid', 'valid_with_warnings', 'invalid'];

let hosted: HostedHandle;
let emptySeries: HostedHandle;
let scratch: string;
const { rpc, getTask, pollUntil } = client(() => hosted.url);

const callSeries = (args: Record<string, unknown>, c = rpc) =>
  c('tools/call', { name: 'run_series', arguments: args }, { name: 'run_series' });

async function until(check: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition never held');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A worker script in plain JavaScript, so it runs without tsx. */
async function fakeWorker(name: string, source: string): Promise<WorkerEntry> {
  const path = join(scratch, `${name}.mjs`);
  await writeFile(path, `import { parentPort, workerData } from 'node:worker_threads';\n${source}`);
  return { url: pathToFileURL(path), execArgv: [] };
}

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'passwerk-series-'));
  await mkdir(join(scratch, 'empty', 'musterwerk'), { recursive: true });
  await writeFile(join(scratch, 'empty', 'musterwerk', 'notes.md'), 'not a supported document');
  const clock = () => new Date(AS_OF);
  hosted = await startHosted({
    host: '127.0.0.1',
    port: 0,
    token: TOKEN,
    seriesDir: SERIES,
    clock,
  });
  emptySeries = await startHosted({
    host: '127.0.0.1',
    port: 0,
    token: TOKEN,
    seriesDir: join(scratch, 'empty'),
    clock,
  });
});

afterEach(async () => {
  await until(() => liveWorkers() === 0, 60_000);
});

afterAll(async () => {
  await hosted.close();
  await emptySeries.close();
  await rm(scratch, { recursive: true, force: true });
});

describe('run_series over the wire', () => {
  it('answers a working task at once', async () => {
    const started = performance.now();
    const r = await callSeries({ series: 'musterwerk', category: 'EV' });
    expect(performance.now() - started).toBeLessThan(500);
    expect(r.body.result).toMatchObject({ resultType: 'task', status: 'working', content: [] });
    await rpc('tasks/cancel', { taskId: r.body.result.taskId }, { name: r.body.result.taskId });
  });

  it('answers an unknown series with an error and starts no task', async () => {
    const r = await callSeries({ series: 'nowhere', category: 'EV' });
    expect(r.body.result?.resultType).not.toBe('task');
    expect(r.body.result?.taskId).toBeUndefined();
    expect(r.body.error ?? r.body.result?.isError).toBeTruthy();
    expect(liveWorkers()).toBe(0);
  });

  it('fails the task naming the model when the series cannot load', async () => {
    const empty = client(() => emptySeries.url);
    const { taskId } = (await callSeries({ series: 'musterwerk', category: 'EV' }, empty.rpc)).body
      .result;
    const task = await empty.pollUntil(taskId, (s) => s !== 'working');
    expect(task.status).toBe('failed');
    expect(task.error.message).toMatch(/model musterwerk has no supported documents/);
  });

  it('cancels a running series and terminates its worker', async () => {
    const { taskId } = (await callSeries({ series: 'musterwerk', category: 'EV' })).body.result;
    await until(() => liveWorkers() === 1);
    const r = await rpc('tasks/cancel', { taskId }, { name: taskId });
    expect(r.body.result).toMatchObject({ taskId, status: 'cancelled' });
    await until(() => liveWorkers() === 0);
    expect((await getTask(taskId)).body.result.status).toBe('cancelled');
  });

  it('keeps tasks/get under 200 ms at p95 for the whole run', async () => {
    const { taskId } = (await callSeries({ series: 'musterwerk', category: 'EV' })).body.result;
    const ms: number[] = [];
    const seen = new Set<string>();
    for (;;) {
      const t = performance.now();
      const { result } = (await getTask(taskId)).body;
      if (result.status !== 'working') break;
      ms.push(performance.now() - t);
      seen.add(result.statusMessage ?? '(no status yet)');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const sorted = [...ms].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.ceil(sorted.length * q) - 1] ?? Number.NaN;
    console.log(
      `tasks/get over ${ms.length} polls: p50 ${at(0.5).toFixed(1)} ms, p95 ${at(0.95).toFixed(1)} ms, ` +
        `max ${at(1).toFixed(1)} ms; seen ${[...seen].join(' | ')}`,
    );
    expect(ms.length).toBeGreaterThanOrEqual(20);
    expect([...seen].some((m) => m.startsWith('Model 1 of 1 · '))).toBe(true);
    expect(at(0.95)).toBeLessThan(200);
  }, 70_000);

  it('completes the musterwerk series as one model with a verdict', async () => {
    const { taskId } = (await callSeries({ series: 'musterwerk', category: 'EV' })).body.result;
    const task = await pollUntil(taskId, (s) => s !== 'working', 60_000);
    expect(task.error?.message).toBeUndefined();
    expect(task.status).toBe('completed');
    const { structuredContent, content } = task.result;
    expect(structuredContent).toMatchObject({ series: 'musterwerk', category: 'EV', asOf: AS_OF });
    expect(structuredContent.models).toHaveLength(1);
    expect(VERDICTS).toContain(structuredContent.models[0].verdict);
    expect(content[0].text.split('\n')[0]).toMatch(
      /^1 models: \d+ valid, \d+ valid_with_warnings, \d+ invalid$/,
    );
  }, 70_000);

  it('runs the twelve-model series as one task, model by model', async () => {
    const { taskId } = (await callSeries({ series: 'musterwerk-12', category: 'EV' })).body.result;
    const seen = new Set<string>();
    let task: { status: string; statusMessage?: string } = { status: 'working' };
    while (task.status === 'working') {
      task = (await getTask(taskId)).body.result;
      if (task.statusMessage) seen.add(task.statusMessage.split(' · ')[0] ?? '');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const done = (await getTask(taskId)).body.result;
    expect(done.status).toBe('completed');
    const { structuredContent, content } = done.result;
    expect(structuredContent.summary).toBe(content[0].text);
    expect(structuredContent.summary.split('\n')[0]).toMatch(/^12 models: /);
    expect(structuredContent.models.map((m: { modelId: string }) => m.modelId)).toEqual(
      Array.from({ length: 12 }, (_, i) => `model-${String(i + 1).padStart(2, '0')}`),
    );
    expect(structuredContent.models.every((m: { conflicts: number }) => m.conflicts === 0)).toBe(
      true,
    );
    expect([...seen].every((line) => /^Model \d+ of 12$/.test(line))).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
  }, 120_000);
});

describe('runInWorker', () => {
  const models: SeriesModel[] = [
    { modelId: 'alpha', files: [{ name: 'a.txt', bytes: new Uint8Array([1]) }] },
    { modelId: 'beta', files: [{ name: 'b.txt', bytes: new Uint8Array([2]) }] },
  ];
  const start: WorkerStart = { models, category: 'EV', asOf: AS_OF, reading: { kind: 'off' } };
  const ctx = (signal = new AbortController().signal, lines: string[] = []) => ({
    signal,
    progress: (line: string) => void lines.push(line),
  });

  it('reports progress per model and collects outcomes in order', async () => {
    const entry = await fakeWorker(
      'scripted',
      `const of = workerData.models.length;
      workerData.models.forEach(({ modelId }, i) => {
        const p = (progress) => parentPort.postMessage({ type: 'progress', model: i + 1, of, modelId, progress });
        p({ step: 'ingest' });
        p({ step: 'extract', facts: 41 });
        p({ step: 'suggest' });
        p({ step: 'apply', facts: 41, mapped: 30 });
        p({ step: 'validate' });
        parentPort.postMessage({ type: 'model', outcome: { modelId } });
      });
      parentPort.postMessage({ type: 'done' });`,
    );
    const lines: string[] = [];
    const runs = await runInWorker(start, ctx(undefined, lines), entry);
    expect(runs.map((r) => r.outcome.modelId)).toEqual(['alpha', 'beta']);
    expect(lines.slice(0, 6)).toEqual([
      'Model 1 of 2 · ingest',
      'Model 1 of 2 · 41 facts',
      'Model 1 of 2 · 41 facts',
      'Model 1 of 2 · 41 facts · 30 mapped',
      'Model 1 of 2 · 41 facts · 30 mapped',
      'Model 2 of 2 · ingest',
    ]);
  });

  it('names the model in flight when the worker reports failure', async () => {
    const entry = await fakeWorker(
      'failing',
      `parentPort.postMessage({ type: 'model', outcome: { modelId: 'alpha' } });
      parentPort.postMessage({ type: 'failed', message: 'pdf unreadable' });`,
    );
    await expect(runInWorker(start, ctx(), entry)).rejects.toThrow(
      'model beta failed: pdf unreadable',
    );
  });

  it('names the model in flight when the worker crashes', async () => {
    const entry = await fakeWorker('crashing', `throw new Error('out of memory');`);
    await expect(runInWorker(start, ctx(), entry)).rejects.toThrow(
      'model alpha failed: out of memory',
    );
  });

  it('terminates the worker at once on abort', async () => {
    const entry = await fakeWorker('hanging', 'setInterval(() => {}, 1000);');
    const controller = new AbortController();
    const run = runInWorker(start, ctx(controller.signal), entry);
    await until(() => liveWorkers() === 1);
    controller.abort(new Error('cancelled'));
    await expect(run).rejects.toThrow('cancelled');
    await until(() => liveWorkers() === 0, 1000);
  });
});
