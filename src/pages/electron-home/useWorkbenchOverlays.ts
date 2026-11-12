import { useCallback, useState, useSyncExternalStore } from 'react';

import { getTopOverlay } from './workbench-overlays';
import { createOverlayStore } from './WorkbenchOverlaysContext';

/**
 * The workbench's overlays: their store (to provide to the tree), their state, the controls that
 * change them, and the close order.
 */
export function useWorkbenchOverlays() {
  const [store] = useState(createOverlayStore);
  const overlays = useSyncExternalStore(store.subscribe, store.getState);

  // Depends only on which overlay is on top, so typing in the palette does not give keyboard
  // and close-request listeners a new callback on every key.
  const top = getTopOverlay(overlays);
  /** Closes the top overlay in the workbench's close order; false when none is open. */
  const closeTopOverlay = useCallback(() => {
    if (!top) return false;
    store.dispatch({ type: 'close', key: top });
    return true;
  }, [store, top]);

  return { store, overlays, controls: store.controls, closeTopOverlay };
}
