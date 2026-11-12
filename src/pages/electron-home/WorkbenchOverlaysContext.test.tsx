import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createOverlayWrapper } from './test-overlays';
import { createOverlayStore, useOverlay, useOverlayControls } from './WorkbenchOverlaysContext';

describe('overlay store', () => {
  it('re-renders a reader only when the part it reads changes', () => {
    const { store, wrapper } = createOverlayWrapper();
    let renders = 0;
    function TrashFlag() {
      renders += 1;
      return <span>{String(useOverlay((overlays) => overlays.trash))}</span>;
    }
    const { container } = render(<TrashFlag />, { wrapper });
    expect(renders).toBe(1);

    // Typing in the palette changes the overlay state on every key.
    for (const search of ['n', 'no', 'not']) {
      act(() => store.controls.set('palette', { mode: 'commands', open: true, search }));
    }
    expect(renders).toBe(1);

    act(() => store.controls.set('trash', true));
    expect(renders).toBe(2);
    expect(container.textContent).toBe('true');
  });

  it('notifies only when an event changes the state', () => {
    const store = createOverlayStore();
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    store.controls.close('trash');
    expect(notified).toBe(0);
    store.controls.openSettings('vault');
    expect(notified).toBe(1);
    expect(store.getState().settings).toEqual({ open: true, tab: 'vault' });
  });

  it('gives the same controls for the life of the store', () => {
    const { store, wrapper } = createOverlayWrapper();
    const { result, rerender } = renderHook(() => useOverlayControls(), { wrapper });
    const first = result.current;
    act(() => store.controls.set('share', true));
    rerender();
    expect(result.current).toBe(first);
  });

  it('asks for the provider when read outside one', () => {
    expect(() => renderHook(() => useOverlayControls())).toThrow('OverlayStoreProvider');
  });
});
