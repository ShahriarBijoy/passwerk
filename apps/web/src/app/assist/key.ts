import { del, get, set } from 'idb-keyval';

/**
 * The assist key's own record, deliberately not a field of `WorkflowState` (ADR D-038):
 *
 * - the autosaved workflow and every exported draft come from the state, and a key inside it
 *   would ride along into a file the supplier sends to their OEM,
 * - "start over" clears the workflow without clearing the key, and forgetting the key does not
 *   discard hours of review.
 *
 * Written only when the reviewer ticks "remember on this device"; unticking deletes it.
 */
export const ASSIST_KEY_STORAGE_KEY = 'passwerk.web.assist.key';

export async function loadAssistKey(): Promise<string | undefined> {
  try {
    const raw = await get(ASSIST_KEY_STORAGE_KEY);
    return typeof raw === 'string' && raw !== '' ? raw : undefined;
  } catch {
    return undefined;
  }
}

export async function saveAssistKey(key: string): Promise<void> {
  try {
    await set(ASSIST_KEY_STORAGE_KEY, key);
  } catch {
    // Storage unavailable (private window, blocked site data): the key still works for this
    // tab, it is simply not remembered.
  }
}

export async function clearAssistKey(): Promise<void> {
  try {
    await del(ASSIST_KEY_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
