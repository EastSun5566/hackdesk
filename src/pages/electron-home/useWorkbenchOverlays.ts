import { useCallback, useMemo, useReducer } from 'react';

import {
  getTopOverlay,
  INITIAL_OVERLAYS,
  overlaysReducer,
  type OverlayControls,
  type OverlayEvent,
} from './workbench-overlays';

/** The workbench's overlays: their state, the controls that change them, and the close order. */
export function useWorkbenchOverlays() {
  const [overlays, dispatch] = useReducer(overlaysReducer, INITIAL_OVERLAYS);

  const controls = useMemo<OverlayControls>(() => ({
    set: (key, value) => dispatch({ type: 'set', key, value } as OverlayEvent),
    close: (key) => dispatch({ type: 'close', key }),
    openSettings: (tab = 'general') => dispatch({ type: 'open_settings', tab }),
  }), []);

  // Depends only on which overlay is on top, so typing in the palette does not give keyboard
  // and close-request listeners a new callback on every key.
  const top = getTopOverlay(overlays);
  /** Closes the top overlay in the workbench's close order; false when none is open. */
  const closeTopOverlay = useCallback(() => {
    if (!top) return false;
    dispatch({ type: 'close', key: top });
    return true;
  }, [top]);

  return { overlays, controls, closeTopOverlay };
}
