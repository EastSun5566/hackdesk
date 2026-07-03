import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_NOTE_FINDER_STATE, type NoteFinderState } from '@/lib/electron-note-finder';

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

  it('keeps bare Option+B for text input and uses Cmd+Option+B for navigator toggle', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    const optionOnlyEvent = new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: 'b',
    });
    window.dispatchEvent(optionOnlyEvent);
    fireEvent.keyDown(window, { key: 'b', altKey: true, metaKey: true });

    expect(optionOnlyEvent.defaultPrevented).toBe(false);
    expect(handlers.runAction).toHaveBeenCalledOnce();
    expect(handlers.runAction).toHaveBeenCalledWith('toggle-navigator');
  });

  it('keeps Cmd+B mapped to the workspace rail', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: 'b', metaKey: true });

    expect(handlers.runAction).toHaveBeenCalledWith('toggle-workspace-rail');
  });

  it('focuses the navigator with Cmd+Shift+E and keeps Option+2 as an alias', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: 'e', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: '2', altKey: true });

    expect(handlers.runAction).toHaveBeenNthCalledWith(1, 'focus-navigator');
    expect(handlers.runAction).toHaveBeenNthCalledWith(2, 'focus-navigator');
  });

  it('routes Cmd+bracket navigation shortcuts through actions', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: '[', metaKey: true });
    fireEvent.keyDown(window, { key: ']', metaKey: true });

    expect(handlers.runAction).toHaveBeenNthCalledWith(1, 'navigate-back');
    expect(handlers.runAction).toHaveBeenNthCalledWith(2, 'navigate-forward');
  });

  it('maps Cmd+9 to the last tab and Cmd+1 to the first tab', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    fireEvent.keyDown(window, { key: '9', metaKey: true });

    expect(handlers.focusTabAtIndex).toHaveBeenNthCalledWith(1, 0);
    expect(handlers.focusTabAtIndex).toHaveBeenNthCalledWith(2, -1);
  });

  it('creates notes with Cmd+N but leaves Ctrl+N for editor navigation conventions', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    const ctrlNEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'n',
    });
    window.dispatchEvent(ctrlNEvent);
    fireEvent.keyDown(window, { key: 'n', metaKey: true });

    expect(ctrlNEvent.defaultPrevented).toBe(false);
    expect(handlers.handleCreateNote).toHaveBeenCalledOnce();
  });

  it('clears finder query, filters, and selected folder with Escape outside editor zones', () => {
    const setFinderState = vi.fn((updater: (current: NoteFinderState) => NoteFinderState) => (
      updater({
        ...DEFAULT_NOTE_FINDER_STATE,
        query: 'draft',
        tagFilters: ['work'],
      })
    ));
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
    expect(setFinderState.mock.results[0]?.value).toMatchObject({ query: '' });
    expect(setSelectedFolderId).not.toHaveBeenCalled();

    setFinderState.mockClear();
    rerender(createHandlers({
      activeFinderState: { ...DEFAULT_NOTE_FINDER_STATE, tagFilters: ['work'] },
      setFinderState,
      setSelectedFolderId,
      selectedFolderId: 'folder-1',
    }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(setFinderState).toHaveBeenCalledOnce();
    expect(setFinderState.mock.results[0]?.value).toMatchObject({ tagFilters: [] });
    expect(setSelectedFolderId).not.toHaveBeenCalled();

    setFinderState.mockClear();
    rerender(createHandlers({
      setFinderState,
      setSelectedFolderId,
      selectedFolderId: 'folder-1',
    }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(setSelectedFolderId).toHaveBeenCalledWith(null);
  });
});
