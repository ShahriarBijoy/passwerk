import { useSyncExternalStore } from 'react';
import type { WorkflowState } from '../workflow/state.ts';
import type { Store } from '../workflow/store.ts';

export function useStore<T>(store: Store, selector: (s: WorkflowState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
