/** @vitest-environment jsdom */
import { App } from '@modelcontextprotocol/ext-apps';
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { getSample } from '@passwerk/core';
import { createServer } from '@passwerk/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';
import { applyTheme, attachSync, hostDownload, languageOf, seedActions } from '../src/bridge.ts';

const CLOCK = '2026-09-05T12:00:00.000Z';

type HostCaps = { downloadFile?: object; updateModelContext?: object };

/**
 * The SDK's own host side (`AppBridge`) wrapping a real MCP client connected to a real
 * passwerk server, joined to the view side (`App`) over an in-memory pair. What the bridge
 * sends is what a host would receive.
 */
async function harness(hostCaps: HostCaps = { updateModelContext: { text: {} } }) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const { server, ctx } = createServer({ clock: CLOCK });
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
  it('sends the file through the host when downloadFile is advertised', async () => {
    const h = await harness({ downloadFile: {} });
    const notify = vi.fn();
    await hostDownload(
      h.app,
      { name: 'x.aas.json', bytes: new TextEncoder().encode('{}'), type: 'application/json' },
      'en',
      'drf_1',
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

  it('otherwise explains what to ask Claude, naming the synced draft', async () => {
    const h = await harness({});
    const notify = vi.fn();
    await hostDownload(
      h.app,
      { name: 'x.aasx', bytes: new Uint8Array(), type: 'application/octet-stream' },
      'de',
      'drf_1',
      notify,
    );
    expect(h.downloads).toHaveLength(0);
    expect(notify).toHaveBeenCalledOnce();
    const text = notify.mock.calls[0]?.[0] as string;
    expect(text).toContain('emit_passport');
    expect(text).toContain('drf_1');
    expect(text).toMatch(/^Dieser Host/);
    await h.close();
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
