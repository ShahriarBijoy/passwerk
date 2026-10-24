import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DownloadStore } from '../src/downloads.js';
import { type HostedHandle, startHosted } from '../src/http.js';
import type { ModelOutcome } from '../src/series/types.js';
import type { DownloadLink } from '../src/tools/runSeries.js';
import { client, TOKEN } from './rpc.js';
import { expectedEntries, fetchZip } from './zip.js';

const SERIES = fileURLToPath(new URL('../../../demo/series', import.meta.url));
const AS_OF = '2026-10-24T12:00:00.000Z';
const clock = () => new Date(AS_OF);

let hosted: HostedHandle;
let tiny: HostedHandle;
const { rpc, pollUntil } = client(() => hosted.url);

beforeAll(async () => {
  hosted = await startHosted({
    host: '127.0.0.1',
    port: 0,
    token: TOKEN,
    seriesDir: SERIES,
    clock,
  });
  tiny = await startHosted({
    host: '127.0.0.1',
    port: 0,
    token: TOKEN,
    seriesDir: SERIES,
    clock,
    downloads: new DownloadStore({ now: clock, maxZipBytes: 1000 }),
  });
});

afterAll(async () => {
  await hosted.close();
  await tiny.close();
});

const callSeries = (args: Record<string, unknown>, tasks = true, c = rpc) =>
  c('tools/call', { name: 'run_series', arguments: args }, { name: 'run_series', tasks });

const csv = async () => ({
  name: 'datasheet-en.csv',
  contentBase64: (await readFile(`${SERIES}/musterwerk/datasheet-en.csv`)).toString('base64'),
});

describe('run_series hands back a one-use download link', () => {
  let task: {
    structuredContent: { download: DownloadLink; summary: string; models: ModelOutcome[] };
    content: { text: string }[];
  };

  beforeAll(async () => {
    const { taskId } = (await callSeries({ series: 'musterwerk', category: 'EV' })).body.result;
    const done = await pollUntil(taskId, (s) => s !== 'working', 60_000);
    expect(done.status).toBe('completed');
    task = done.result;
  }, 70_000);

  it('names the zip after the series and ends the summary with a curl line', () => {
    const { download, summary } = task.structuredContent;
    expect(download).toEqual({
      url: expect.stringMatching(
        new RegExp(`^${hosted.url}/download/dl_[a-z2-7]{32}/passwerk-musterwerk\\.zip$`),
      ),
      file: 'passwerk-musterwerk.zip',
      bytes: expect.any(Number),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      expiresAt: '2026-10-24T12:15:00.000Z',
    });
    expect(task.structuredContent).not.toHaveProperty('downloadRefused');
    expect(summary).toBe(task.content[0]?.text);
    expect(summary.split('\n').at(-1)).toBe(
      `Download (one use, 15 minutes): curl -fsS -o passwerk-musterwerk.zip "${download.url}"`,
    );
  });

  it('serves the zip once, one folder per model, holding the files the result digests', async () => {
    const { download, models } = task.structuredContent;
    const zip = await fetchZip(download.url);
    expect(zip.status).toBe(200);
    expect(zip.bytes).toBe(download.bytes);
    expect(zip.sha256).toBe(download.sha256);
    expect(zip.entries).toEqual(expectedEntries(models));
    expect(zip.entries.map(([path]) => path)).toEqual([
      'musterwerk/musterwerk.aas.json',
      'musterwerk/musterwerk.aasx',
      'musterwerk/musterwerk.html',
      'musterwerk/musterwerk.gaps.json',
    ]);
    expect((await fetchZip(download.url)).status).toBe(404);
  });

  it('gives an inline run a link to the same bytes, as the clock is the same', async () => {
    const r = await callSeries({ series: 'musterwerk', category: 'EV' }, false);
    expect(r.body.result.resultType).toBe('complete');
    const { download } = r.body.result.structuredContent;
    expect(download.url).not.toBe(task.structuredContent.download.url);
    expect(download.sha256).toBe(task.structuredContent.download.sha256);
    expect((await fetchZip(download.url)).sha256).toBe(download.sha256);
  }, 70_000);

  it('names the zip and its folder after the modelId for inline documents', async () => {
    const r = await callSeries(
      { documents: [await csv()], category: 'EV', modelId: 'pack-7' },
      false,
    );
    const { download, models } = r.body.result.structuredContent;
    expect(download.file).toBe('passwerk-pack-7.zip');
    const zip = await fetchZip(download.url);
    expect(zip.entries).toEqual(expectedEntries(models));
    expect(zip.entries[0]?.[0]).toBe('pack-7/pack-7.aas.json');
  }, 70_000);

  it('builds the link of a task from the origin of the call that started it', async () => {
    const started = await rpc(
      'tools/call',
      { name: 'run_series', arguments: { documents: [await csv()], category: 'EV' } },
      {
        name: 'run_series',
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': '8080-abc.instabox.tech' },
      },
    );
    const done = await pollUntil(started.body.result.taskId, (s) => s !== 'working', 60_000);
    expect(done.result.structuredContent.download.url).toMatch(
      /^https:\/\/8080-abc\.instabox\.tech\/download\/dl_[a-z2-7]{32}\/passwerk-upload\.zip$/,
    );
  }, 70_000);

  it('completes without a link when the zip is over the cap, and says so', async () => {
    const r = await callSeries(
      { documents: [await csv()], category: 'EV' },
      false,
      client(() => tiny.url).rpc,
    );
    const { structuredContent, content } = r.body.result;
    expect(structuredContent.models).toHaveLength(1);
    expect(structuredContent.download).toBeNull();
    expect(structuredContent.downloadRefused).toBe('too_large');
    expect(content[0].text.split('\n').at(-1)).toMatch(
      /^No download: the zip of this run is \d+ KB, more than the 1 KB one download holds\.$/,
    );
  }, 70_000);
});
