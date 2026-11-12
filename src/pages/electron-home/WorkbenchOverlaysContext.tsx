import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

import {
  INITIAL_OVERLAYS,
  overlaysReducer,
  type OverlayControls,
  type OverlayEvent,
  type WorkbenchOverlays,
} from './workbench-overlays';

/**
 * Holds the workbench overlays outside React, so a component can subscribe to the one overlay it
 * shows. Typing in the command palette changes the overlay state on every key; a sidebar that
 * reads only whether Trash is open does not re-render for it.
 */
export type OverlayStore = {
  getState: () => WorkbenchOverlays;
  subscribe: (listener: () => void) => () => void;
  dispatch: (event: OverlayEvent) => void;
  /** Stable for the life of the store. */
  controls: OverlayControls;
};

export function createOverlayStore(initial: WorkbenchOverlays = INITIAL_OVERLAYS): OverlayStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const dispatch = (event: OverlayEvent) => {
    const next = overlaysReducer(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispatch,
    controls: {
      set: (key, value) => dispatch({ type: 'set', key, value } as OverlayEvent),
      close: (key) => dispatch({ type: 'close', key }),
      openSettings: (tab = 'general') => dispatch({ type: 'open_settings', tab }),
    },
  };
}

const OverlayStoreContext = createContext<OverlayStore | null>(null);

export function OverlayStoreProvider({ store, children }: { store: OverlayStore; children: ReactNode }) {
  return <OverlayStoreContext.Provider value={store}>{children}</OverlayStoreContext.Provider>;
}

function useOverlayStore() {
  const store = useContext(OverlayStoreContext);
  if (!store) throw new Error('Workbench overlays are read inside OverlayStoreProvider.');
  return store;
}

/**
 * One part of the overlay state. The component re-renders only when that part changes, so select
 * a value the state already holds (an overlay's own value), not a new object.
 */
export function useOverlay<T>(select: (overlays: WorkbenchOverlays) => T): T {
  const store = useOverlayStore();
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

export function useOverlayControls(): OverlayControls {
  return useOverlayStore().controls;
}
