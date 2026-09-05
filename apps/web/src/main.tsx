import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { nowIso } from './app/clock.ts';
import { ErrorBoundary } from './app/ErrorBoundary.tsx';
import { attachPersistence, clearState, loadState } from './app/persistence.ts';
import './index.css';
import { initialState } from './workflow/state.ts';
import { createStore } from './workflow/store.ts';

async function boot() {
  const loaded = await loadState();
  const store = createStore(loaded.kind === 'state' ? loaded.state : initialState);
  if (loaded.kind !== 'unavailable') attachPersistence(store);
  const notice =
    loaded.kind === 'unavailable' || loaded.kind === 'version' ? loaded.kind : undefined;
  const root = document.getElementById('root');
  if (!root) throw new Error('missing #root');
  createRoot(root).render(
    <ErrorBoundary
      lang={store.getState().language}
      onReset={() => {
        void clearState();
        store.dispatch({ type: 'reset', at: nowIso() });
      }}
    >
      <App store={store} {...(notice ? { storageNotice: notice } : {})} />
    </ErrorBoundary>,
  );
}

void boot();
