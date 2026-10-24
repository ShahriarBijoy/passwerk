import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DownloadStore, randomDownloadId } from '../src/downloads.js';
import { type HostedHandle, startHosted } from '../src/http.js';
import { client, TOKEN } from './rpc.js';

const START = Date.parse('2026-10-24T12:00:00.000Z');
const MINUTE = 60 * 1000;
const MiB = 1024 * 1024;
const NAME = 'passwerk-musterwerk.zip';

let now = START;
const clock = () => new Date(now);
const bytes = (n: number, fill = 0x50) => new Uint8Array(n).fill(fill);

afterEach(() => {
  now = START;
});

describe('DownloadStore', () => {
  it('lends a zip under its id and name once, and forgets it once sent', () => {
    const store = new DownloadStore({ now: clock });
    const created = store.create(NAME, bytes(10));
    if (typeof created === 'string') throw new Error(created);
    expect(created.id).toMatch(/^dl_[a-z2-7]{32}$/);
    expect(Date.parse(created.expiresAt) - START).toBe(15 * MINUTE);
    expect(store.open(created.id, 'passwerk-other.zip')).toBeUndefined();

    const transfer = store.open(created.id, NAME);
    expect(transfer?.bytes).toEqual(bytes(10));
    transfer?.commit();
    expect(store.open(created.id, NAME)).toBeUndefined();
    expect(store.heldBytes).toBe(0);
  });

  it('lends a zip to one transfer at a time and keeps it when that transfer fails', () => {
    const store = new DownloadStore({ now: clock });
    const created = store.create(NAME, bytes(10));
    if (typeof created === 'string') throw new Error(created);
    const first = store.open(created.id, NAME);
    expect(store.open(created.id, NAME)).toBeUndefined();
    first?.abort();
    first?.commit();
    const second = store.open(created.id, NAME);
    expect(second?.bytes.byteLength).toBe(10);
    second?.commit();
    expect(store.open(created.id, NAME)).toBeUndefined();
  });

  it('forgets a zip 15 minutes after it was created and frees its bytes', () => {
    const store = new DownloadStore({ now: clock });
    const created = store.create(NAME, bytes(10));
    if (typeof created === 'string') throw new Error(created);
    now = START + 15 * MINUTE - 1;
    expect(store.heldBytes).toBe(10);
    now = START + 15 * MINUTE;
    expect(store.open(created.id, NAME)).toBeUndefined();
    expect(store.heldBytes).toBe(0);
  });

  it('frees the bytes of an expired zip on the next create', () => {
    const store = new DownloadStore({ now: clock, maxStoreBytes: 15 });
    expect(store.create(NAME, bytes(10))).not.toBeTypeOf('string');
    expect(store.create(NAME, bytes(10))).toBe('store_full');
    now = START + 15 * MINUTE;
    expect(store.create(NAME, bytes(10))).not.toBeTypeOf('string');
    expect(store.heldBytes).toBe(10);
  });

  it('refuses a zip over the per-zip cap and one that would pass the store cap', () => {
    const store = new DownloadStore({ now: clock, maxZipBytes: 10, maxStoreBytes: 25 });
    expect(store.create(NAME, bytes(11))).toBe('too_large');
    expect(store.create(NAME, bytes(10))).not.toBeTypeOf('string');
    expect(store.create(NAME, bytes(10))).not.toBeTypeOf('string');
    expect(store.create(NAME, bytes(10))).toBe('store_full');
    expect(store.heldBytes).toBe(20);
  });

  it('defaults to 64 MiB per zip and 256 MiB in all', () => {
    expect(new DownloadStore().limits).toEqual({
      ttlMs: 15 * MINUTE,
      maxZipBytes: 64 * MiB,
      maxStoreBytes: 256 * MiB,
    });
  });

  it('takes only a safe zip name', () => {
    const store = new DownloadStore({ now: clock });
    for (const name of ['a"b.zip', '../a.zip', 'a/b.zip', 'a.json', '.zip', 'a b.zip']) {
      expect(() => store.create(name, bytes(1)), name).toThrow(/zip name/);
    }
  });
});

describe('GET /download/<id>/<name>', () => {
  const logs: string[] = [];
  const store = new DownloadStore({ now: clock });
  let hosted: HostedHandle;
  const { rpc } = client(() => hosted.url);

  beforeAll(async () => {
    hosted = await startHosted({
      host: '127.0.0.1',
      port: 0,
      token: TOKEN,
      clock,
      downloads: store,
      log: (line) => void logs.push(line),
    });
  });

  afterAll(async () => {
    await hosted.close();
  });

  function offer(zip = bytes(1000, 0x51), name = NAME) {
    const created = store.create(name, zip);
    if (typeof created === 'string') throw new Error(created);
    return { id: created.id, url: `${hosted.url}/download/${created.id}/${name}` };
  }

  async function get(url: string, init: RequestInit = {}) {
    const res = await fetch(url, init);
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: new Uint8Array(await res.arrayBuffer()),
    };
  }

  it('sends the zip once, as an attachment, without a bearer', async () => {
    const zip = bytes(1000, 0x51);
    const { id, url } = offer(zip);
    const first = await get(url);
    expect(first.status).toBe(200);
    expect(first.headers).toMatchObject({
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${NAME}"`,
      'cache-control': 'no-store',
      'content-length': '1000',
    });
    expect(first.body).toEqual(zip);
    expect((await get(url)).status).toBe(404);

    const lines = logs.join('\n');
    expect(lines).toContain('GET /download 200');
    expect(lines).toContain('GET /download 404');
    expect(lines).not.toContain(id);
    expect(lines).not.toContain(NAME);
    expect((await rpc('server/discover', {}, { token: null })).status).toBe(401);
  });

  it('answers a wrong name, an unknown, a malformed, a used and an expired id alike', async () => {
    const used = offer();
    expect((await get(used.url)).status).toBe(200);
    const expiring = offer();
    const wrongName = offer();
    const answers = [
      await get(used.url),
      await get(`${hosted.url}/download/${randomDownloadId()}/${NAME}`),
      await get(`${hosted.url}/download/not-an-id/${NAME}`),
      await get(`${hosted.url}/download/${wrongName.id}/passwerk-other.zip`),
      await get(`${hosted.url}/download/${wrongName.id}/${NAME.toUpperCase()}`),
      await get(`${hosted.url}/download/${wrongName.id}`),
      await get(`${wrongName.url}?x=1`),
      await get(`${wrongName.url}/`),
      await get(`${hosted.url}/download/${wrongName.id}/passwerk-musterwerk%2Ezip`),
      await get(`${hosted.url}/download/${wrongName.id}/..%2F${NAME}`),
    ];
    expect((await get(wrongName.url)).status).toBe(200);
    now = START + 15 * MINUTE;
    answers.push(await get(expiring.url));
    for (const a of answers) {
      expect(a.status).toBe(404);
      expect(a.headers['content-type']).toBe('application/json');
      expect(new TextDecoder().decode(a.body)).toBe('{"error":"not found"}');
    }
  });

  it('answers every method but GET with 405, and keeps the zip', async () => {
    const { url } = offer();
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'PATCH']) {
      const r = await get(url, { method });
      expect(r.status, method).toBe(405);
      expect(r.headers['allow'], method).toBe('GET');
    }
    expect((await get(url, { method: 'POST' })).headers['allow']).toBe('GET');
    expect((await get(`${hosted.url}/download/x`, { method: 'POST' })).status).toBe(405);
    expect((await get(url)).status).toBe(200);
  });
});
