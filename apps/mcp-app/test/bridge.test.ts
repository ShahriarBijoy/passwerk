/** @vitest-environment jsdom */
import { App } from '@modelcontextprotocol/ext-apps';
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { emitAasJson, getSample, type PassportDraft, validateSchema } from '@passwerk/core';
import { createServer, type ServerOptions } from '@passwerk/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';
import { memoryFileSystem } from '../../../packages/server/test/harness.ts';
import {
  applyTheme,
  attachSync,
  exportActionOf,
  hostDownload,
  languageOf,
  saveRootOf,
  seedActions,
  workerUrlOf,
} from '../src/bridge.ts';

const CLOCK = '2026-09-05T12:00:00.000Z';

type HostCaps = { downloadFile?: object; updateModelContext?: object };

/**
 * The SDK's own host side (`AppBridge`) wrapping a real MCP client connected to a real
 * passwerk server, joined to the view side (`App`) over an in-memory pair. What the bridge
 * sends is what a host would receive.
 */
async function harness(
  hostCaps: HostCaps = { updateModelContext: { text: {} } },
  serverOptions: ServerOptions = {},
) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const { server, ctx } = createServer({ clock: CLOCK, ...serverOptions });
  const client = new Client({ name: 'host-test', version: '0' });
  await server.connect(st);
  await client.connect(ct);
  const bridge = new AppBridge(
    client,
    { name: 'test-host', version: '0' },
    { serverTools: {}, serverResources: {}, ...hostCaps },
    { hostContext: { theme: 'light', locale: 'de-DE', platform: 'web', displayMode: 'inline' } },
  );
  const modelContext: unknown[] = [];
  const downloads: unknown[] = [];
  bridge.onupdatemodelcontext = async (p) => {
    modelContext.push(p);
    return {};
  };
  bridge.ondownloadfile = async (p) => {
    downloads.push(p);
    return {};
  };
  const [at, bt] = InMemoryTransport.createLinkedPair();
  const app = new App({ name: 'passwerk workbench', version: '0' }, {}, { autoResize: false });
  await Promise.all([bridge.connect(bt), app.connect(at)]);
  return {
    app,
    ctx,
    modelContext,
    downloads,
    close: async () => {
      await app.close();
      await bridge.close();
      await client.close();
      await server.close();
    },
  };
}

describe('seedActions', () => {
  it('a draft seeds import and the review step; the locale picks the language', () => {
    const actions = seedActions({ draftId: 'drf_x', draft: getSample('ev-valid') }, 'en-US', CLOCK);
    expect(actions.map((a) => a.type)).toEqual(['setLanguage', 'importDraft', 'goTo']);
    expect(actions[0]).toMatchObject({ type: 'setLanguage', language: 'en', at: CLOCK });
    expect(actions[2]).toMatchObject({ type: 'goTo', step: 'review' });
  });

  it('facts seed filesIngested with one summary per document', () => {
    const facts = {
      facts: [],
      tables: [],
      documents: [
        {
          name: 'a.pdf',
          format: 'pdf',
          contentType: 'application/pdf',
          sha256: 'x',
          lang: 'de',
          pages: 1,
        },
      ],
    };
    const actions = seedActions({ facts }, 'de', CLOCK);
    expect(actions.map((a) => a.type)).toEqual(['setLanguage', 'filesIngested']);
    expect(actions[1]).toMatchObject({
      summaries: [{ name: 'a.pdf', format: 'pdf', pages: 1, sha256: 'x', lang: 'de', size: 0 }],
      facts,
    });
  });

  it('an empty result only sets the language; a draft that is not a PassportDraft is ignored', () => {
    expect(seedActions({}, undefined, CLOCK).map((a) => a.type)).toEqual(['setLanguage']);
    expect(seedActions(undefined, 'de', CLOCK).map((a) => a.type)).toEqual(['setLanguage']);
    expect(seedActions({ draft: { nonsense: 1 } }, 'de', CLOCK).map((a) => a.type)).toEqual([
      'setLanguage',
    ]);
    expect(languageOf(undefined)).toBe('en');
    expect(languageOf('de-CH')).toBe('de');
    expect(languageOf('DE')).toBe('de');
    expect(languageOf('fr-FR')).toBe('en');
  });
});

describe('attachSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores the derived draft once per change and tells the model its id', async () => {
    const h = await harness();
    const store = createStore(initialState);
    const states: { draftId?: string; error?: string }[] = [];
    const stop = attachSync(h.app, store, {
      asOf: () => CLOCK,
      debounceMs: 1000,
      onState: (s) => states.push(s),
    });
    for (const a of seedActions({ draft: getSample('ev-valid') }, 'de', CLOCK)) store.dispatch(a);
    await vi.advanceTimersByTimeAsync(900);
    expect(h.modelContext).toHaveLength(0);
    // The sync crosses real macrotasks (WebCrypto hashing in the session store), so completion is
    // awaited rather than stepped: vi.waitFor advances the fake clock between checks.
    await vi.advanceTimersByTimeAsync(200);
    await vi.waitFor(() => expect(h.modelContext).toHaveLength(1));
    const ctx = h.modelContext[0] as {
      content: { type: string; text: string }[];
      structuredContent: { draftId: string; verdict: string; mandatoryCompleteness: string };
    };
    expect(ctx.structuredContent.verdict).toBe('valid');
    expect(ctx.structuredContent.draftId).toMatch(/^drf_/);
    expect(ctx.content[0]?.text).toContain(ctx.structuredContent.draftId);
    expect(ctx.content[0]?.text).toMatch(/^passwerk-Werkbank/);
    expect(h.ctx.store.has('draft', ctx.structuredContent.draftId)).toBe(true);
    expect(states.at(-1)).toEqual({ draftId: ctx.structuredContent.draftId });
    // A change that leaves the draft identical does not sync again.
    store.dispatch({ type: 'setLanguage', language: 'en', at: CLOCK });
    await vi.advanceTimersByTimeAsync(1100);
    expect(h.modelContext).toHaveLength(1);
    // A decision that changes the draft does (the sample's nominal voltage is not 401 V).
    store.dispatch({
      type: 'decide',
      decision: { kind: 'manual', attributeId: 'nominalVoltage', value: '401', unit: 'V' },
      at: CLOCK,
    });
    await vi.advanceTimersByTimeAsync(1100);
    await vi.waitFor(() => expect(h.modelContext).toHaveLength(2));
    const second = h.modelContext[1] as { structuredContent: { draftId: string } };
    expect(second.structuredContent.draftId).not.toBe(ctx.structuredContent.draftId);
    expect(h.ctx.store.has('draft', second.structuredContent.draftId)).toBe(true);
    stop();
    await h.close();
  });

  it('skips updateModelContext when the host lacks it but still stores the draft', async () => {
    const h = await harness({});
    const store = createStore(initialState);
    const states: { draftId?: string }[] = [];
    const stop = attachSync(h.app, store, {
      asOf: () => CLOCK,
      debounceMs: 10,
      onState: (s) => states.push(s),
    });
    for (const a of seedActions({ draft: getSample('ev-valid') }, 'de', CLOCK)) store.dispatch(a);
    await vi.advanceTimersByTimeAsync(50);
    await vi.waitFor(() =>
      expect(states.at(-1)).toEqual({ draftId: expect.stringMatching(/^drf_/) }),
    );
    expect(h.modelContext).toHaveLength(0);
    stop();
    await h.close();
  });

  it('does nothing before a project exists', async () => {
    const h = await harness();
    const store = createStore(initialState);
    const states: unknown[] = [];
    const stop = attachSync(h.app, store, {
      asOf: () => CLOCK,
      debounceMs: 10,
      onState: (s) => states.push(s),
    });
    store.dispatch({ type: 'setLanguage', language: 'en', at: CLOCK });
    await vi.advanceTimersByTimeAsync(50);
    expect(states).toEqual([]);
    expect(h.modelContext).toEqual([]);
    stop();
    await h.close();
  });
});

describe('hostDownload', () => {
  const draft = validateSchema(getSample('ev-valid')).draft as PassportDraft;
  const json = (name: string) => ({
    name,
    bytes: new TextEncoder().encode('{}'),
    type: 'application/json',
  });

  it('sends the file through the host when downloadFile is advertised', async () => {
    const h = await harness({ downloadFile: {} });
    const notify = vi.fn();
    await hostDownload(
      h.app,
      { file: json('x.aas.json'), kind: 'aasJson', lang: 'en', draftId: 'drf_1' },
      notify,
    );
    expect(notify).not.toHaveBeenCalled();
    expect(h.downloads).toHaveLength(1);
    expect(h.downloads[0]).toEqual({
      contents: [
        {
          type: 'resource',
          resource: {
            uri: 'passwerk://export/x.aas.json',
            mimeType: 'application/json',
            blob: 'e30=',
          },
        },
      ],
    });
    await h.close();
  });

  it('otherwise asks the assistant, host-neutral, naming the synced draft', async () => {
    const h = await harness({});
    const notify = vi.fn();
    await hostDownload(
      h.app,
      {
        file: { name: 'x.aasx', bytes: new Uint8Array(), type: 'application/octet-stream' },
        kind: 'aasx',
        lang: 'de',
        draftId: 'drf_1',
      },
      notify,
    );
    expect(h.downloads).toHaveLength(0);
    expect(notify).toHaveBeenCalledOnce();
    const notice = notify.mock.calls[0]?.[0] as { kind: string; text: string };
    expect(notice.kind).toBe('info');
    const text = notice.text;
    expect(text).toContain('emit_passport');
    expect(text).toContain('drf_1');
    expect(text).toMatch(/^Dieser Host/);
    expect(text).not.toContain('Claude');
    expect(text).not.toContain('outDir');
    await h.close();
  });

  it('downloads through the host even when a local server names a save root (Claude Desktop)', async () => {
    const fsys = memoryFileSystem({});
    const h = await harness({ downloadFile: {} }, { fs: fsys, workspace: { root: '/work' } });
    const notify = vi.fn();
    await hostDownload(
      h.app,
      {
        file: json('x.aas.json'),
        kind: 'aasJson',
        lang: 'en',
        draft,
        asOf: CLOCK,
        saveRoot: '/work',
      },
      notify,
    );
    expect(h.downloads).toHaveLength(1);
    expect(fsys.written.size).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    await h.close();
  });

  it('saves into the folder a local server named, through emit_passport, byte for byte', async () => {
    const fsys = memoryFileSystem({});
    const h = await harness({}, { fs: fsys, workspace: { root: '/work' } });
    const notify = vi.fn();
    const expected = emitAasJson(draft, { asOf: CLOCK }).output;
    await hostDownload(
      h.app,
      {
        file: json('ignored.aas.json'),
        kind: 'aasJson',
        lang: 'en',
        draft,
        asOf: CLOCK,
        saveRoot: '/work',
      },
      notify,
    );
    const [path, bytes] = [...fsys.written][0] ?? [];
    expect(path).toMatch(/^[/]work[/]passwerk-exports[/].+[.]aas[.]json$/);
    expect(new TextDecoder().decode(bytes)).toBe(expected);
    expect(h.downloads).toHaveLength(0);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ kind: 'ok' });
    expect(notify.mock.calls[0]?.[0].text).toContain(path);
    await h.close();
  });

  it('saves the QR through generate_carrier', async () => {
    const fsys = memoryFileSystem({});
    const h = await harness({}, { fs: fsys, workspace: { root: '/work' } });
    const notify = vi.fn();
    await hostDownload(
      h.app,
      { file: json('x.qr.svg'), kind: 'qr', lang: 'en', draft, asOf: CLOCK, saveRoot: '/work' },
      notify,
    );
    const [path] = [...fsys.written][0] ?? [];
    expect(path).toMatch(/[.]svg$/);
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ kind: 'ok' });
    expect(notify.mock.calls[0]?.[0].text).toContain(path);
    await h.close();
  });

  it('points to gap_report for the gap file, which no tool writes', async () => {
    const fsys = memoryFileSystem({});
    const h = await harness({}, { fs: fsys, workspace: { root: '/work' } });
    const notify = vi.fn();
    await hostDownload(
      h.app,
      {
        file: json('x.gaps.json'),
        kind: 'gaps',
        lang: 'en',
        draftId: 'drf_1',
        draft,
        asOf: CLOCK,
        saveRoot: '/work',
      },
      notify,
    );
    expect(fsys.written.size).toBe(0);
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ kind: 'info' });
    expect(notify.mock.calls[0]?.[0].text).toContain('gap_report');
    await h.close();
  });

  it('reports a failed save instead of dropping it', async () => {
    const h = await harness({}, { fs: memoryFileSystem({}), workspace: { root: '/work' } });
    const notify = vi.fn();
    await hostDownload(
      h.app,
      {
        file: json('x.aas.json'),
        kind: 'aasJson',
        lang: 'en',
        draft: { meta: {} } as unknown as PassportDraft,
        asOf: CLOCK,
        saveRoot: '/work',
      },
      notify,
    );
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ kind: 'error' });
    expect(notify.mock.calls[0]?.[0].text).toMatch(/^Could not save/);
    await h.close();
  });
});

describe('exportActionOf', () => {
  it('downloads whenever the host can, and saves only without downloads but with a save root', () => {
    expect(exportActionOf({ downloadFile: {} }, '/work')).toBe('download');
    expect(exportActionOf({ downloadFile: {} }, undefined)).toBe('download');
    expect(exportActionOf({}, '/work')).toBe('save');
    expect(exportActionOf({}, undefined)).toBe('download');
    expect(exportActionOf(undefined, undefined)).toBe('download');
  });
});

describe('saveRootOf', () => {
  it('reads the root a local server names and ignores anything else', () => {
    expect(saveRootOf({ saveToFolder: { root: '/work' } })).toBe('/work');
    expect(saveRootOf({ saveToFolder: { root: 3 } })).toBeUndefined();
    expect(saveRootOf({})).toBeUndefined();
    expect(saveRootOf(undefined)).toBeUndefined();
  });
});

describe('workerUrlOf', () => {
  it('re-wraps an inlined data: worker as a Blob URL and passes other URLs through', async () => {
    const blobs: Blob[] = [];
    const create = (b: Blob) => {
      blobs.push(b);
      return `blob:test/${blobs.length}`;
    };
    const source = 'self.postMessage(1)';
    const url = workerUrlOf(`data:text/javascript;base64,${btoa(source)}`, create);
    expect(url).toBe('blob:test/1');
    expect(blobs[0]?.type).toBe('text/javascript');
    expect(await blobs[0]?.text()).toBe(source);
    expect(workerUrlOf('/assets/pdf.worker.mjs', create)).toBe('/assets/pdf.worker.mjs');
    expect(blobs).toHaveLength(1);
  });
});

describe('applyTheme', () => {
  it('toggles the dark class the web app styles by', () => {
    const root = document.createElement('html');
    applyTheme('dark', root);
    expect(root.classList.contains('dark')).toBe(true);
    applyTheme('light', root);
    expect(root.classList.contains('dark')).toBe(false);
    applyTheme(undefined, root);
    expect(root.classList.contains('dark')).toBe(false);
  });
});
