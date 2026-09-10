import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { loadAssistKey } from './app/assist/key.ts';
import { nowIso } from './app/clock.ts';
import { ErrorBoundary } from './app/ErrorBoundary.tsx';
import { attachPersistence, clearState, loadState } from './app/persistence.ts';
import { applyTheme, browserPlatform } from './app/platform.ts';
import './index.css';
import { initialState } from './workflow/state.ts';
import { createStore } from './workflow/store.ts';

async function boot() {
  const loaded = await loadState();
  // Read before mount so nothing has to fetch it from an effect after the first paint.
  const assistKey = await loadAssistKey();
  const store = createStore(loaded.kind === 'state' ? loaded.state : initialState);
  if (loaded.kind !== 'unavailable') attachPersistence(store);
  const notice =
    loaded.kind === 'unavailable' || loaded.kind === 'version' ? loaded.kind : undefined;
  const root = document.getElementById('root');
  if (!root) throw new Error('missing #root');
  applyTheme(browserPlatform.theme?.current() ?? 'light');
  createRoot(root).render(
    <ErrorBoundary
      lang={store.getState().language}
      onReset={() => {
        void clearState();
        store.dispatch({ type: 'reset', at: nowIso() });
      }}
    >
      <App
        store={store}
        platform={browserPlatform}
        {...(notice ? { storageNotice: notice } : {})}
        {...(assistKey === undefined ? {} : { initialAssistKey: assistKey })}
      />
    </ErrorBoundary>,
  );
}

void boot();
