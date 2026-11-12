import type { ReactNode } from 'react';

import { INITIAL_OVERLAYS, type WorkbenchOverlays } from './workbench-overlays';
import { createOverlayStore, OverlayStoreProvider } from './WorkbenchOverlaysContext';

/** A workbench overlay store for a component test, starting from `initial`, and a wrapper providing it. */
export function createOverlayWrapper(initial: Partial<WorkbenchOverlays> = {}) {
  const store = createOverlayStore({ ...INITIAL_OVERLAYS, ...initial });
  function OverlayWrapper({ children }: { children: ReactNode }) {
    return <OverlayStoreProvider store={store}>{children}</OverlayStoreProvider>;
  }
  return { store, wrapper: OverlayWrapper };
}
