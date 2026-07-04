import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_NOTE_FINDER_STATE, type NoteFinderState } from '@/lib/electron-note-finder';

import { useWorkbenchShortcuts, type WorkbenchShortcutHandlers } from './useWorkbenchShortcuts';

function createHandlers(overrides: Partial<WorkbenchShortcutHandlers> = {}): WorkbenchShortcutHandlers {
  return {
    activeFinderState: DEFAULT_NOTE_FINDER_STATE,
    closeTransientLayer: vi.fn(() => false),
    focusPaneAtIndex: vi.fn(() => true),
    focusTabAtIndex: vi.fn(() => true),
    handleCreateNote: vi.fn(),
    noteDirty: true,
    openPalette: vi.fn(),
    paneCount: 1,
    platform: 'darwin',
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

  it('keeps Cmd+F for in-note search and releases Cmd+Shift+F', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    const workspaceSearchEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'f',
      metaKey: true,
      shiftKey: true,
    });
    window.dispatchEvent(workspaceSearchEvent);

    expect(handlers.runAction).toHaveBeenCalledOnce();
    expect(handlers.runAction).toHaveBeenCalledWith('find-in-note');
    expect(workspaceSearchEvent.defaultPrevented).toBe(false);
  });

  it('opens the command palette with Cmd+K or Cmd+Shift+P and Quick Open with Cmd+P', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.keyDown(window, { key: 'p', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'p', metaKey: true });

    expect(handlers.openPalette).toHaveBeenCalledTimes(2);
    expect(handlers.runAction).toHaveBeenCalledOnce();
    expect(handlers.runAction).toHaveBeenCalledWith('open-quick-open');
  });

  it('uses Ctrl+Shift+P and Ctrl+P on Windows', () => {
    const handlers = createHandlers({ platform: 'win32' });

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

    expect(handlers.openPalette).toHaveBeenCalledOnce();
    expect(handlers.runAction).toHaveBeenCalledWith('open-quick-open');
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

  it('leaves macOS Ctrl letter shortcuts available for editor text navigation', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    for (const key of ['b', 'f', 's', 'w', 't', 'k', 'r', 'e']) {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        key,
      });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(handlers.runAction).not.toHaveBeenCalled();
    expect(handlers.openPalette).not.toHaveBeenCalled();
    expect(handlers.refreshWorkspace).not.toHaveBeenCalled();
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

  it('leaves primary modifier plus Option brackets for editor folding', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    const foldEvent = new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: '[',
      metaKey: true,
    });
    const unfoldEvent = new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: ']',
      metaKey: true,
    });
    window.dispatchEvent(foldEvent);
    window.dispatchEvent(unfoldEvent);

    expect(foldEvent.defaultPrevented).toBe(false);
    expect(unfoldEvent.defaultPrevented).toBe(false);
    expect(handlers.runAction).not.toHaveBeenCalled();
  });

  it('leaves bare Option brackets available for text input', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    const optionNextEvent = new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: ']',
    });
    const optionPreviousEvent = new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: '[',
    });
    window.dispatchEvent(optionNextEvent);
    window.dispatchEvent(optionPreviousEvent);

    expect(optionNextEvent.defaultPrevented).toBe(false);
    expect(optionPreviousEvent.defaultPrevented).toBe(false);
    expect(handlers.runAction).not.toHaveBeenCalled();
  });

  it('focuses the note filter with slash outside editing and transient surfaces', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: '/' });

    expect(handlers.runAction).toHaveBeenCalledOnce();
    expect(handlers.runAction).toHaveBeenCalledWith('search-notes');
  });

  it('leaves slash available in editors, form controls, and dialogs', () => {
    const handlers = createHandlers();
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    const input = document.createElement('input');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const dialogButton = document.createElement('button');
    dialog.append(dialogButton);
    document.body.append(editor, input, dialog);

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(editor, { key: '/' });
    fireEvent.keyDown(input, { key: '/' });
    fireEvent.keyDown(dialogButton, { key: '/' });

    expect(handlers.runAction).not.toHaveBeenCalled();
    editor.remove();
    input.remove();
    dialog.remove();
  });

  it('ignores composing and already-handled key events', () => {
    const handlers = createHandlers();
    renderHook(() => useWorkbenchShortcuts(handlers));
    const composingEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: '/',
    });
    const handledEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '/',
    });
    handledEvent.preventDefault();

    window.dispatchEvent(composingEvent);
    window.dispatchEvent(handledEvent);

    expect(handlers.runAction).not.toHaveBeenCalled();
  });

  it('does not intercept Cmd+D or replace the split pane shortcut', () => {
    const handlers = createHandlers();
    renderHook(() => useWorkbenchShortcuts(handlers));
    const selectNextOccurrenceEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'd',
      metaKey: true,
    });
    window.dispatchEvent(selectNextOccurrenceEvent);
    fireEvent.keyDown(window, { key: '\\', metaKey: true });

    expect(selectNextOccurrenceEvent.defaultPrevented).toBe(false);
    expect(handlers.runAction).toHaveBeenCalledOnce();
    expect(handlers.runAction).toHaveBeenCalledWith('split-pane-right');
  });

  it('keeps tab switching shortcuts separate from pane switching', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true, metaKey: true });
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true, metaKey: true });
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true, shiftKey: true });

    expect(handlers.runAction).toHaveBeenNthCalledWith(1, 'focus-next-tab');
    expect(handlers.runAction).toHaveBeenNthCalledWith(2, 'focus-previous-tab');
    expect(handlers.runAction).toHaveBeenNthCalledWith(3, 'focus-next-tab');
    expect(handlers.runAction).toHaveBeenNthCalledWith(4, 'focus-previous-tab');
  });

  it('maps Cmd+9 to the last tab and Cmd+1 to the first tab', () => {
    const handlers = createHandlers();

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    fireEvent.keyDown(window, { key: '9', metaKey: true });

    expect(handlers.focusTabAtIndex).toHaveBeenNthCalledWith(1, 0);
    expect(handlers.focusTabAtIndex).toHaveBeenNthCalledWith(2, -1);
  });

  it('uses Cmd+1 and Cmd+2 to focus panes when split panes are visible', () => {
    const handlers = createHandlers({ paneCount: 2 });

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    fireEvent.keyDown(window, { key: '2', metaKey: true });

    expect(handlers.focusPaneAtIndex).toHaveBeenNthCalledWith(1, 0);
    expect(handlers.focusPaneAtIndex).toHaveBeenNthCalledWith(2, 1);
    expect(handlers.focusTabAtIndex).not.toHaveBeenCalled();
  });

  it('leaves macOS Ctrl+number available when split panes are visible', () => {
    const handlers = createHandlers({ paneCount: 2 });

    renderHook(() => useWorkbenchShortcuts(handlers));
    const ctrlOneEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: '1',
    });
    const ctrlTwoEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: '2',
    });
    window.dispatchEvent(ctrlOneEvent);
    window.dispatchEvent(ctrlTwoEvent);

    expect(ctrlOneEvent.defaultPrevented).toBe(false);
    expect(ctrlTwoEvent.defaultPrevented).toBe(false);
    expect(handlers.focusPaneAtIndex).not.toHaveBeenCalled();
    expect(handlers.focusTabAtIndex).not.toHaveBeenCalled();
  });

  it('does not intercept Cmd+3 through Cmd+9 when split panes are visible', () => {
    const handlers = createHandlers({ paneCount: 2 });

    renderHook(() => useWorkbenchShortcuts(handlers));
    const cmdThreeEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '3',
      metaKey: true,
    });
    const cmdNineEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '9',
      metaKey: true,
    });
    window.dispatchEvent(cmdThreeEvent);
    window.dispatchEvent(cmdNineEvent);

    expect(cmdThreeEvent.defaultPrevented).toBe(false);
    expect(cmdNineEvent.defaultPrevented).toBe(false);
    expect(handlers.focusPaneAtIndex).not.toHaveBeenCalled();
    expect(handlers.focusTabAtIndex).not.toHaveBeenCalled();
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

  it('uses Ctrl as the primary app shortcut modifier on Windows and Linux', () => {
    const handlers = createHandlers({ platform: 'win32', paneCount: 2 });

    renderHook(() => useWorkbenchShortcuts(handlers));
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });

    expect(handlers.runAction).toHaveBeenNthCalledWith(1, 'find-in-note');
    expect(handlers.runAction).toHaveBeenNthCalledWith(2, 'toggle-workspace-rail');
    expect(handlers.runAction).toHaveBeenNthCalledWith(3, 'save-note');
    expect(handlers.focusPaneAtIndex).toHaveBeenNthCalledWith(1, 0);
    expect(handlers.focusPaneAtIndex).toHaveBeenNthCalledWith(2, 1);
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
