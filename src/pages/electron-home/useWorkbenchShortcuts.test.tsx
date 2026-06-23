import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';

import { useWorkbenchShortcuts, type WorkbenchShortcutHandlers } from './useWorkbenchShortcuts';

function createHandlers(overrides: Partial<WorkbenchShortcutHandlers> = {}): WorkbenchShortcutHandlers {
  return {
    activeFinderState: DEFAULT_NOTE_FINDER_STATE,
    closeTransientLayer: vi.fn(() => false),
    focusTabAtIndex: vi.fn(() => true),
    handleCreateNote: vi.fn(),
    noteDirty: true,
    openPalette: vi.fn(),
    refreshWorkspace: vi.fn(),
    runAction: vi.fn(),
    selectedFolderId: null,
    setFinderState: vi.fn(),
    setSelectedFolderId: vi.fn(),
    ...overrides,
  };
}

describe('useWorkbenchShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes note search and workspace search shortcuts through actions', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    fireEvent.keyDown(window, { key: 'f', metaKey: true, shiftKey: true });

    expect(handlers.runAction).toHaveBeenNthCalledWith(1, 'find-in-note');
    expect(handlers.runAction).toHaveBeenNthCalledWith(2, 'search-notes');
  });

  it('maps Cmd+9 to the last tab and Cmd+1 to the first tab', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    fireEvent.keyDown(window, { key: '9', metaKey: true });

    expect(handlers.focusTabAtIndex).toHaveBeenNthCalledWith(1, 0);
    expect(handlers.focusTabAtIndex).toHaveBeenNthCalledWith(2, -1);
  });

  it('clears finder query and selected folder with Escape outside editor zones', () => {
    const setFinderState = vi.fn();
    const setSelectedFolderId = vi.fn();
    const { rerender } = renderHook((props: WorkbenchShortcutHandlers) => useWorkbenchShortcuts(props), {
      initialProps: createHandlers({
        activeFinderState: { ...DEFAULT_NOTE_FINDER_STATE, query: 'draft' },
        setFinderState,
        setSelectedFolderId,
        selectedFolderId: 'folder-1',
      }),
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(setFinderState).toHaveBeenCalledOnce();
    expect(setSelectedFolderId).not.toHaveBeenCalled();

    rerender(createHandlers({
      setFinderState,
      setSelectedFolderId,
      selectedFolderId: 'folder-1',
    }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(setSelectedFolderId).toHaveBeenCalledWith(null);
  });
});
