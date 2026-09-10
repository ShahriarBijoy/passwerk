/**
 * Boot of the passwerk workbench inside an MCP Apps host (ADR D-037). The web app's `App`
 * renders first, so the screen is never blank; the host handshake runs beside it and, once
 * connected, seeds the store from the `review_passport` result and starts the draft sync.
 */
import { App as HostApp } from '@modelcontextprotocol/ext-apps';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App.tsx';
import { nowIso } from '@/app/clock.ts';
import { ErrorBoundary } from '@/app/ErrorBoundary.tsx';
import type { Platform } from '@/app/platform.ts';
import { initialState } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';
import {
  applyTheme,
  attachSync,
  hostDownload,
  languageOf,
  type SyncState,
  seedActions,
  workerUrlOf,
} from './bridge.ts';
import './index.css';

const SYNC_DEBOUNCE_MS = 1000;

const store = createStore(initialState);
const host = new HostApp({ name: 'passwerk workbench', version: __WORKBENCH_VERSION__ });
let sync: SyncState = {};

// The host's "cannot download" message is not workflow state: it lives beside the store and
// re-renders the tree through `render()`.
let notice: string | undefined;

const applyHeight = (mode: string | undefined) =>
  document.documentElement.style.setProperty(
    '--instrument-height',
    mode === 'fullscreen' ? '100vh' : '640px',
  );
applyHeight('inline');

const platform: Platform = {
  download: (file) =>
    void hostDownload(host, file, store.getState().language, sync.draftId, (text) => {
      notice = text;
      render();
    }),
  // The host owns the instance's lifetime; nothing is persisted, so nothing is cleared.
  clearPersisted: () => {},
  pdfWorkerSrc: workerUrlOf(pdfWorkerUrl),
  display: {
    available: () =>
      (host.getHostContext()?.availableDisplayModes ?? []).filter(
        (m): m is 'inline' | 'fullscreen' => m === 'inline' || m === 'fullscreen',
      ),
    current: () => (host.getHostContext()?.displayMode === 'fullscreen' ? 'fullscreen' : 'inline'),
    request: async (mode) => {
      await host.requestDisplayMode({ mode });
      applyHeight(host.getHostContext()?.displayMode);
      render();
    },
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
const reactRoot = createRoot(root);
const render = () =>
  reactRoot.render(
    <ErrorBoundary
      lang={store.getState().language}
      onReset={() => store.dispatch({ type: 'reset', at: nowIso() })}
    >
      <App store={store} platform={platform} {...(notice ? { hostNotice: notice } : {})} />
    </ErrorBoundary>,
  );
render();

// Handlers before connect(): the host may notify immediately after the handshake.
host.ontoolresult = (result) => {
  const structured = result.structuredContent as Record<string, unknown> | undefined;
  for (const a of seedActions(structured, host.getHostContext()?.locale, nowIso())) {
    store.dispatch(a);
  }
};
host.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyTheme(ctx.theme);
  if (ctx.locale) {
    store.dispatch({ type: 'setLanguage', language: languageOf(ctx.locale), at: nowIso() });
  }
  applyHeight(ctx.displayMode);
  render();
};

void host
  .connect()
  .then(() => {
    const ctx = host.getHostContext();
    applyTheme(ctx?.theme);
    store.dispatch({ type: 'setLanguage', language: languageOf(ctx?.locale), at: nowIso() });
    attachSync(host, store, {
      asOf: nowIso,
      debounceMs: SYNC_DEBOUNCE_MS,
      onState: (s) => {
        sync = s;
      },
    });
  })
  .catch((e: unknown) => {
    // Opened outside a host (a plain browser tab): the workbench still works as the web app,
    // without sync or host downloads.
    console.warn('passwerk workbench: no MCP Apps host', e);
  });
