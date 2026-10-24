import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type HostedHandle, startHosted } from '../src/http.js';
import { liveWorkers } from '../src/series/runner.js';
import { randomUploadId, UploadStore } from '../src/uploads.js';
import { client, type RpcOptions, TOKEN } from './rpc.js';

const MUSTERWERK = fileURLToPath(new URL('../../../demo/series/musterwerk', import.meta.url));
const SERIES = fileURLToPath(new URL('../../../demo/series', import.meta.url));
const START = Date.parse('2026-10-24T12:00:00.000Z');
const MiB = 1024 * 1024;
const VERDICTS = ['valid', 'valid_with_warnings', 'invalid'];

let now = START;
const clock = () => new Date(now);
const logs: string[] = [];
const store = new UploadStore({ now: clock });
let hosted: HostedHandle;
const { rpc, pollUntil } = client(() => hosted.url);

beforeAll(async () => {
  hosted = await startHosted({
    host: '127.0.0.1',
    port: 0,
    token: TOKEN,
    seriesDir: SERIES,
    clock,
    uploads: store,
    log: (line) => void logs.push(line),
  });
});

afterEach(async () => {
  now = START;
  const deadline = Date.now() + 60_000;
  while (liveWorkers() > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
});

afterAll(async () => {
  await hosted.close();
});

interface Slot {
  uploadId: string;
  putUrl: string;
  howTo: string;
  expiresAt: string;
}

async function createUpload(o: RpcOptions = {}, c = rpc): Promise<Slot> {
  const r = await c(
    'tools/call',
    { name: 'create_upload', arguments: {} },
    {
      ...o,
      name: 'create_upload',
    },
  );
  expect(r.body.result.isError).toBeUndefined();
  return r.body.result.structuredContent;
}

async function put(putUrl: string, name: string, body: Uint8Array | string) {
  const res = await fetch(`${putUrl}/${name}`, { method: 'PUT', body });
  return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
}

const callSeries = (args: Record<string, unknown>) =>
  rpc('tools/call', { name: 'run_series', arguments: args }, { name: 'run_series' });

/** A tool call that started no task and reported an error, as a message. */
function refusal(r: { body: { error?: { message: string }; result?: Record<string, unknown> } }) {
  expect(r.body.result?.['resultType']).not.toBe('task');
  const result = r.body.result as { isError?: boolean; content?: { text: string }[] } | undefined;
  return r.body.error?.message ?? (result?.isError ? result.content?.[0]?.text : undefined);
}

const musterwerk = (name: string) => readFile(`${MUSTERWERK}/${name}`);

describe('create_upload, PUT, run_series { upload }', () => {
  it('runs the uploaded files as one model and takes the slot once', async () => {
    const slot = await createUpload();
    expect(slot.uploadId).toMatch(/^upl_[a-z2-7]{32}$/);
    expect(slot.putUrl).toBe(`${hosted.url}/upload/${slot.uploadId}`);
    expect(slot.howTo).toBe(
      `curl -sS -X PUT --data-binary @"<local file>" "${slot.putUrl}/<file name>"`,
    );
    expect(Date.parse(slot.expiresAt) - START).toBe(15 * 60 * 1000);

    for (const name of ['stueckliste.xlsx', 'lieferantenerklaerung.pdf']) {
      const r = await put(slot.putUrl, name, await musterwerk(name));
      expect(r.status).toBe(201);
    }

    const started = await callSeries({ upload: slot.uploadId, category: 'EV', modelId: 'pack-1' });
    const { taskId } = started.body.result;
    const task = await pollUntil(taskId, (s) => s !== 'working', 60_000);
    expect(task.error?.message).toBeUndefined();
    expect(task.status).toBe('completed');
    const { structuredContent: sc, content } = task.result;
    expect(sc).toMatchObject({
      source: 'upload',
      category: 'EV',
      reading: 'off',
      documents: ['lieferantenerklaerung.pdf', 'stueckliste.xlsx'],
    });
    expect(sc.models).toHaveLength(1);
    expect(sc.models[0].modelId).toBe('pack-1');
    expect(sc.models[0].facts).toBeGreaterThan(0);
    expect(VERDICTS).toContain(sc.models[0].verdict);
    expect(content[0].text.split('\n').at(-1)).toBe('AI reading: off');

    expect(refusal(await callSeries({ upload: slot.uploadId, category: 'EV' }))).toMatch(
      /already used/,
    );
    expect((await put(slot.putUrl, 'late.txt', 'x')).status).toBe(404);

    const lines = logs.join('\n');
    expect(lines).toContain('PUT /upload 201');
    expect(lines).not.toContain(slot.uploadId);
    expect(lines).not.toContain('stueckliste');
  }, 70_000);

  it('answers an unknown, a malformed and a used id with the same 404', async () => {
    const used = await createUpload();
    await put(used.putUrl, 'a.txt', 'Nennspannung: 400 V');
    expect(store.take(used.uploadId)).not.toBeTypeOf('string');
    const answers = await Promise.all([
      put(used.putUrl, 'a.txt', 'x'),
      put(`${hosted.url}/upload/${randomUploadId()}`, 'a.txt', 'x'),
      put(`${hosted.url}/upload/not-an-id`, 'a.txt', 'x'),
      put(`${hosted.url}/upload/${randomUploadId()}`, 'a.exe', 'x'),
    ]);
    expect(answers[0]).toEqual({
      status: 404,
      type: 'application/json',
      text: '{"error":"not found"}',
    });
    for (const a of answers) expect(a).toEqual(answers[0]);
  });

  it('forgets a slot after 15 minutes', async () => {
    const slot = await createUpload();
    expect((await put(slot.putUrl, 'a.txt', 'x')).status).toBe(201);
    now = START + 15 * 60 * 1000;
    expect((await put(slot.putUrl, 'b.txt', 'x')).status).toBe(404);
    expect(refusal(await callSeries({ upload: slot.uploadId, category: 'EV' }))).toMatch(
      /Unknown, expired or already used/,
    );
  });

  it('keeps a slot that run_series refused because it was empty', async () => {
    const slot = await createUpload();
    expect(refusal(await callSeries({ upload: slot.uploadId, category: 'EV' }))).toMatch(
      /No file was uploaded/,
    );
    expect((await put(slot.putUrl, 'a.txt', 'x')).status).toBe(201);
  });

  it('refuses bad file names with 400', async () => {
    const slot = await createUpload();
    for (const name of ['..%2Fx.pdf', '.env', 'a.exe', '%2E%2E%2Fx.pdf', 'a%5Cb.pdf', '.pdf']) {
      expect((await put(slot.putUrl, name, 'x')).status, name).toBe(400);
    }
    expect((await put(slot.putUrl, 'Daten%20Blatt_v1-2.CSV', 'a;b')).status).toBe(201);
  });

  it('holds at most 20 files and replaces a file sent again', async () => {
    const slot = await createUpload();
    for (let i = 1; i <= 20; i++) {
      expect((await put(slot.putUrl, `f${i}.txt`, `${i}`)).status).toBe(201);
    }
    expect((await put(slot.putUrl, 'f21.txt', 'x')).status).toBe(409);
    const again = await put(slot.putUrl, 'f1.txt', 'replaced');
    expect(again.status).toBe(201);
    expect(JSON.parse(again.text)).toMatchObject({ files: 20 });
  });

  it('accepts a PUT without a bearer while /mcp still answers 401', async () => {
    const slot = await createUpload();
    const res = await fetch(`${slot.putUrl}/a.txt`, { method: 'PUT', body: 'x' });
    expect(res.status).toBe(201);
    expect((await rpc('server/discover', {}, { token: null })).status).toBe(401);
  });
});

/** Streams chunked 1 MiB pieces until the server answers or `maxBytes` went out. */
function streamUntilAnswered(url: string, maxBytes: number, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; sent: number; continued: boolean }>((resolve, reject) => {
    let sent = 0;
    let continued = false;
    const req = request(url, { method: 'PUT', headers });
    req.on('error', () => {});
    req.on('continue', () => {
      continued = true;
    });
    req.on('response', (res) => {
      res.resume();
      req.destroy();
      resolve({ status: res.statusCode ?? 0, sent, continued });
    });
    req.on('close', () => reject(new Error(`closed without an answer after ${sent} bytes`)));
    if (headers['expect'] !== undefined) {
      req.flushHeaders();
      return;
    }
    const chunk = Buffer.alloc(MiB, 0x41);
    const pump = () => {
      while (sent < maxBytes && !req.destroyed) {
        sent += chunk.byteLength;
        if (!req.write(chunk)) return void req.once('drain', pump);
      }
      if (!req.destroyed) req.end();
    };
    pump();
  });
}

describe('size limits', () => {
  it('answers 413 for a body over 10 MB before the client finished sending it', async () => {
    const slot = await createUpload();
    const held = store.heldBytes;
    const r = await streamUntilAnswered(`${slot.putUrl}/big.pdf`, 200 * MiB);
    expect(r.status).toBe(413);
    expect(r.sent).toBeLessThan(200 * MiB);
    expect(store.heldBytes).toBe(held);
    expect((await put(slot.putUrl, 'small.pdf', 'x')).status).toBe(201);
  });

  it('answers 413 to a declared length over 10 MB without asking for the body', async () => {
    const slot = await createUpload();
    const r = await streamUntilAnswered(`${slot.putUrl}/big.pdf`, 0, {
      'content-length': String(10 * MiB + 1),
      expect: '100-continue',
    });
    expect(r).toMatchObject({ status: 413, continued: false });
  });

  it('caps a slot at its total and the store across slots', async () => {
    const small = new UploadStore({ now: clock, maxTotalBytes: 50, maxStoreBytes: 80 });
    const capped = await startHosted({ host: '127.0.0.1', port: 0, token: TOKEN, uploads: small });
    try {
      const c = client(() => capped.url);
      const a = await createUpload({}, c.rpc);
      const b = await createUpload({}, c.rpc);
      expect((await put(a.putUrl, 'one.txt', 'x'.repeat(30))).status).toBe(201);
      expect((await put(a.putUrl, 'two.txt', 'x'.repeat(30))).status).toBe(413);
      expect((await put(b.putUrl, 'one.txt', 'x'.repeat(45))).status).toBe(201);
      const c3 = await createUpload({}, c.rpc);
      expect((await put(c3.putUrl, 'one.txt', 'x'.repeat(10))).status).toBe(503);
      expect(small.heldBytes).toBe(75);
    } finally {
      await capped.close();
    }
  });
});

describe('run_series { documents }', () => {
  it('runs inline base64 documents as one model', async () => {
    const name = 'datasheet-en.csv';
    const contentBase64 = (await musterwerk(name)).toString('base64');
    const { taskId } = (await callSeries({ documents: [{ name, contentBase64 }], category: 'EV' }))
      .body.result;
    const task = await pollUntil(taskId, (s) => s !== 'working', 60_000);
    expect(task.status).toBe('completed');
    expect(task.result.structuredContent).toMatchObject({ source: 'documents', documents: [name] });
    expect(task.result.structuredContent.models[0].modelId).toBe('upload');
    expect(JSON.stringify(task.result)).not.toContain(contentBase64);
  }, 70_000);

  it('refuses inline documents over 1 MB in all and bad names', async () => {
    const half = Buffer.alloc(MiB / 2 + 3, 0x41).toString('base64');
    const tooBig = await callSeries({
      documents: [
        { name: 'a.txt', contentBase64: half },
        { name: 'b.txt', contentBase64: half },
      ],
      category: 'EV',
    });
    expect(refusal(tooBig)).toMatch(/at most 1048576/);
    const badName = await callSeries({
      documents: [{ name: '../a.txt', contentBase64: 'eA==' }],
      category: 'EV',
    });
    expect(refusal(badName)).toBeTruthy();
    const twoSources = await callSeries({ series: 'musterwerk', upload: 'x', category: 'EV' });
    expect(refusal(twoSources)).toMatch(/exactly one/);
    expect(liveWorkers()).toBe(0);
  });
});

describe('putUrl base', () => {
  it('takes X-Forwarded-Proto and X-Forwarded-Host, ignoring a malformed host', async () => {
    const forwarded = await createUpload({
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': '8080-abc.instabox.tech' },
    });
    expect(forwarded.putUrl).toBe(`https://8080-abc.instabox.tech/upload/${forwarded.uploadId}`);
    const malformed = await createUpload({
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.example/path' },
    });
    expect(malformed.putUrl).toBe(`${hosted.url}/upload/${malformed.uploadId}`);
  });

  it('prefers PASSWERK_PUBLIC_URL over every header', async () => {
    const pinned = await startHosted({
      host: '127.0.0.1',
      port: 0,
      token: TOKEN,
      publicUrl: 'https://8080-pinned.instabox.tech/',
    });
    try {
      const slot = await createUpload(
        { headers: { 'x-forwarded-host': 'other.example' } },
        client(() => pinned.url).rpc,
      );
      expect(slot.putUrl).toBe(`https://8080-pinned.instabox.tech/upload/${slot.uploadId}`);
    } finally {
      await pinned.close();
    }
  });

  it('refuses to start with a public URL that is not http or https', async () => {
    await expect(
      startHosted({ host: '127.0.0.1', port: 0, token: TOKEN, publicUrl: 'ftp://x' }),
    ).rejects.toThrow(/PASSWERK_PUBLIC_URL/);
  });
});
