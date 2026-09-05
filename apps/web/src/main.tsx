import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { attachPersistence, loadState } from './app/persistence.ts';
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
  createRoot(root).render(<App store={store} {...(notice ? { storageNotice: notice } : {})} />);
}

void boot();
