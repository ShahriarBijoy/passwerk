import { del, get, set } from 'idb-keyval';
import { STATE_VERSION, type WorkflowState } from '../workflow/state.ts';
import type { Store } from '../workflow/store.ts';

export const STORAGE_KEY = 'passwerk.web.state';

export type LoadResult =
  | { kind: 'state'; state: WorkflowState }
  | { kind: 'none' }
  | { kind: 'version' }
  | { kind: 'unavailable' };

/**
 * v2 predates the assist slice (ADR D-038) and is otherwise the current shape. A stored record
 * can hold hours of review, so it is carried forward with an empty assist rather than
 * discarded. Any other version is still refused: a shape this app cannot read is not a state.
 */
function migrate(raw: Partial<WorkflowState> & { version?: number }): WorkflowState | null {
  if (raw.version === STATE_VERSION) return raw as WorkflowState;
  if (raw.version === 2) return { ...(raw as WorkflowState), version: STATE_VERSION, assist: null };
  return null;
}

export async function loadState(): Promise<LoadResult> {
  try {
    const raw = (await get(STORAGE_KEY)) as Partial<WorkflowState> | undefined;
    if (raw === undefined) return { kind: 'none' };
    const state = migrate(raw);
    return state === null ? { kind: 'version' } : { kind: 'state', state };
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
