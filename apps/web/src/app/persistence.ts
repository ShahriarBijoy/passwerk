import { del, get, set } from 'idb-keyval';
import { STATE_VERSION, type WorkflowState } from '../workflow/state.ts';
import type { Store } from '../workflow/store.ts';

export const STORAGE_KEY = 'passwerk.web.state';

export type LoadResult =
  | { kind: 'state'; state: WorkflowState }
  | { kind: 'none' }
  | { kind: 'version' }
  | { kind: 'unavailable' };

export async function loadState(): Promise<LoadResult> {
  try {
    const raw = (await get(STORAGE_KEY)) as Partial<WorkflowState> | undefined;
    if (raw === undefined) return { kind: 'none' };
    if (raw.version !== STATE_VERSION) return { kind: 'version' };
    return { kind: 'state', state: raw as WorkflowState };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** Debounced autosave of the input state. Returns the unsubscribe function. */
export function attachPersistence(store: Store, delayMs = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const off = store.subscribe(() => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void set(STORAGE_KEY, store.getState()).catch(() => undefined);
    }, delayMs);
  });
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    off();
  };
}

export async function clearState(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
