import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPersistence, clearState, loadState } from '@/app/persistence.ts';
import { initialState, STATE_VERSION } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';

const { db } = vi.hoisted(() => ({ db: new Map<string, unknown>() }));
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => db.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void db.set(k, v)),
  del: vi.fn(async (k: string) => void db.delete(k)),
}));

const AT = '2026-09-05T12:00:00Z';

describe('persistence', () => {
  beforeEach(() => db.clear());

  it('reports none on an empty store', async () => {
    expect(await loadState()).toEqual({ kind: 'none' });
  });

  it('round-trips the state and rejects an unknown version', async () => {
    db.set('passwerk.web.state', { ...initialState, language: 'en' });
    expect(await loadState()).toEqual({
      kind: 'state',
      state: { ...initialState, language: 'en' },
    });
    db.set('passwerk.web.state', { ...initialState, version: STATE_VERSION + 1 });
    expect(await loadState()).toEqual({ kind: 'version' });
  });

  it('reads a state saved before the generation counter as generation 0', async () => {
    const { generation: _dropped, ...before } = initialState;
    db.set('passwerk.web.state', before);
    expect(await loadState()).toEqual({ kind: 'state', state: { ...before, generation: 0 } });
  });

  it('writes after a dispatch (debounced) and clearState deletes', async () => {
    vi.useFakeTimers();
    const store = createStore(initialState);
    const off = attachPersistence(store, 50);
    store.dispatch({ type: 'setLanguage', language: 'en', at: AT });
    expect(db.has('passwerk.web.state')).toBe(false);
    await vi.advanceTimersByTimeAsync(60);
    expect(db.get('passwerk.web.state')).toMatchObject({ language: 'en' });
    off();
    await clearState();
    expect(db.has('passwerk.web.state')).toBe(false);
    vi.useRealTimers();
  });

  it('reports unavailable when IndexedDB throws', async () => {
    const idb = await import('idb-keyval');
    vi.mocked(idb.get).mockRejectedValueOnce(new Error('blocked'));
    expect(await loadState()).toEqual({ kind: 'unavailable' });
  });
});
