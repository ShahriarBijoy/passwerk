import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type HostedHandle, startHosted } from '../src/http.js';
import {
  parseCassette,
  type Reader,
  type ReadingResult,
  recordedReader,
  replayReader,
} from '../src/reading/index.js';
import { loadSeries } from '../src/series/load.js';
import { runModel } from '../src/series/pipeline.js';
import type { ModelOutcome, SeriesModel } from '../src/series/types.js';
import { client, TOKEN } from './rpc.js';
import { expectedEntries, fetchZip } from './zip.js';

const SERIES = fileURLToPath(new URL('../../../demo/series', import.meta.url));
const AS_OF = '2026-10-24T12:00:00.000Z';
const COMPLETE = 'musterwerk-complete';
const cassette = parseCassette(
  readFileSync(join(import.meta.dirname, 'fixtures', 'jev', `${COMPLETE}.json`), 'utf8'),
);

let hosted: HostedHandle;
const { rpc, getTask, pollUntil } = client(() => hosted.url);

beforeAll(async () => {
  hosted = await startHosted({
    host: '127.0.0.1',
    port: 0,
    token: TOKEN,
    seriesDir: SERIES,
    clock: () => new Date(AS_OF),
    reading: { kind: 'replay', cassette },
  });
});

afterAll(async () => {
  await hosted.close();
});

const callSeries = (args: Record<string, unknown>, tasks = true) =>
  rpc(
    'tools/call',
    { name: 'run_series', arguments: { series: COMPLETE, category: 'EV', ...args } },
    { name: 'run_series', tasks },
  );

const update = (taskId: string, inputResponses: Record<string, unknown>) =>
  rpc('tasks/update', { taskId, inputResponses }, { name: taskId });

const answer = (choice: 'apply' | 'skip') => ({ action: 'accept', content: { answer: choice } });

async function askedTask(args: Record<string, unknown> = {}) {
  const { taskId } = (await callSeries(args)).body.result;
  const task = await pollUntil(taskId, (s) => s !== 'working', 60_000);
  expect(task.status).toBe('input_required');
  return { taskId, keys: Object.keys(task.inputRequests), task };
}

async function answerAll(taskId: string, keys: string[], with_: (key: string) => unknown) {
  const half = Math.ceil(keys.length / 2);
  await update(taskId, Object.fromEntries(keys.slice(0, half).map((k) => [k, with_(k)])));
  expect((await getTask(taskId)).body.result.status).toBe('input_required');
  await update(taskId, Object.fromEntries(keys.slice(half).map((k) => [k, with_(k)])));
  const done = await pollUntil(taskId, (s) => s !== 'working' && s !== 'input_required', 60_000);
  expect(done.error?.message).toBeUndefined();
  expect(done.status).toBe('completed');
  return done.result;
}

describe('run_series asks to confirm the values the AI reading held', () => {
  let held: ModelOutcome;

  beforeAll(async () => {
    const { taskId } = (await callSeries({ confirm: 'hold' })).body.result;
    const done = await pollUntil(taskId, (s) => s !== 'working', 60_000);
    held = done.result.structuredContent.models[0];
  }, 70_000);

  it('holds eleven values when asked to hold, and says so', () => {
    expect(held.verdict).toBe('invalid');
    expect(held.reading?.toConfirm).toHaveLength(11);
    expect(held.reading?.confirmed).toBe(0);
  });

  it('asks one form question per held value through elicitation/create', async () => {
    const { taskId, keys, task } = await askedTask();
    expect(keys).toHaveLength(11);
    expect(keys[0]).toBe('01-componentPartNumbers');
    for (const key of keys) {
      expect(task.inputRequests[key].method).toBe('elicitation/create');
      expect(task.inputRequests[key].params.mode).toBe('form');
    }
    expect(task).not.toHaveProperty('result');
    await rpc('tasks/cancel', { taskId }, { name: taskId });
  }, 70_000);

  it('applies every value when all are confirmed: valid at 100 %, with provenance', async () => {
    const { taskId, keys } = await askedTask();
    const result = await answerAll(taskId, keys, () => answer('apply'));
    const [model] = result.structuredContent.models as ModelOutcome[];
    expect(model?.verdict).toBe('valid');
    expect(model?.gap.mandatoryCompleteness).toBe(100);
    expect(model?.gap.missingRequired).toEqual([]);
    expect(model?.reading).toMatchObject({ applied: 16, confirmed: 11, toConfirm: [] });
    expect(result.content[0].text).toMatch(/11 confirmed, 0 skipped/);
    expect(result.structuredContent).not.toHaveProperty('readings');

    // The emitted passport is the draft whose confirmed values and documents
    // reading.test.ts checks one by one.
    const [files] = (await loadSeries(SERIES, COMPLETE)) as [SeriesModel];
    let recorded: ReadingResult | undefined;
    const reader = replayReader(cassette);
    const keeping: Reader = { read: async (i) => (recorded = await reader.read(i)) };
    const options = { category: 'EV', asOf: AS_OF, read: true } as const;
    await runModel(files, options, keeping);
    if (!recorded) throw new Error('the reader never ran');
    const all = { ...recorded, held: [], confirmed: recorded.held };
    const expected = (await runModel(files, options, recordedReader(all))).outcome;
    expect(model?.artefacts).toEqual(expected.artefacts);

    // The zip holds the resumed files, not the ones the first pass emitted before asking.
    const zip = await fetchZip(result.structuredContent.download.url);
    expect(zip.entries).toEqual(expectedEntries([model as ModelOutcome]));
    const [path, aasJson] = zip.entries[0] ?? [];
    expect(path).toBe(`${COMPLETE}/${COMPLETE}.aas.json`);
    expect(aasJson).toBe(model?.artefacts[0]?.sha256);
    expect(aasJson).not.toBe(held.artefacts[0]?.sha256);
  }, 120_000);

  it('gives the held outcome when every value is skipped or declined', async () => {
    const { taskId, keys } = await askedTask();
    const result = await answerAll(taskId, keys, (k) =>
      keys.indexOf(k) % 2 === 0 ? answer('skip') : { action: 'decline' },
    );
    const [model] = result.structuredContent.models;
    expect(canonicalJson(model)).toBe(canonicalJson(held));
    expect(result.content[0].text).toMatch(/0 confirmed, 11 skipped/);
  }, 120_000);

  it('never asks a client without the tasks extension', async () => {
    const r = await callSeries({}, false);
    expect(r.body.result.resultType).toBe('complete');
    expect(r.body.result.structuredContent.models[0].reading.toConfirm).toHaveLength(11);
  }, 70_000);
});
