import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OpenNoteTab, NoteWorkspaceState } from './note-workspace';
import {
  useWorkbenchActions,
  type WorkbenchActionHandlers,
  type WorkbenchActionsOptions,
} from './useWorkbenchActions';

function createTab(overrides: Partial<OpenNoteTab> = {}): OpenNoteTab {
  return {
    noteId: 'note-1',
    shortId: 'short-1',
    tabId: 'tab-1',
    teamPath: null,
    title: 'Test note',
    updatedAtMillis: null,
    ...overrides,
  };
}

function createWorkspaceState(tabs: OpenNoteTab[] = [createTab()]): NoteWorkspaceState {
  const tabMap = Object.fromEntries(tabs.map((tab) => [tab.tabId, tab]));

  return {
    activePaneId: 'pane-1',
    drafts: {},
    panes: [{
      activeTabId: tabs[0]?.tabId ?? null,
      paneId: 'pane-1',
      size: 100,
      tabIds: tabs.map((tab) => tab.tabId),
    }],
    backStack: [],
    forwardStack: [],
    recentlyClosedTabs: [],
    scopeKey: 'personal',
    tabs: tabMap,
    version: 1,
  };
}

function createHandlers(overrides: Partial<WorkbenchActionHandlers> = {}): WorkbenchActionHandlers {
  return {
    closeActiveTab: vi.fn(),
    closeOtherTabs: vi.fn(),
    closeTabsToRight: vi.fn(),
    createFolder: vi.fn(),
    createNote: vi.fn(),
    deleteSelectedFolder: vi.fn(),
    deleteSelectedNote: vi.fn(),
    duplicateActiveTab: vi.fn(),
    exportDebugLogs: vi.fn(),
    exportSelectedMarkdown: vi.fn(),
    attachImage: vi.fn(),
    findInNote: vi.fn(),
    focusEditor: vi.fn(),
    focusInspector: vi.fn(),
    focusNavigator: vi.fn(),
    focusNextPane: vi.fn(),
    focusNextTab: vi.fn(),
    focusPreviousPane: vi.fn(),
    focusPreviousTab: vi.fn(),
    focusWorkspace: vi.fn(),
    focusWorkspaceSearch: vi.fn(),
    goHistory: vi.fn(),
    importMarkdownNote: vi.fn(),
    moveTabToOtherPane: vi.fn(),
    navigateBack: vi.fn(),
    navigateForward: vi.fn(),
    openPalette: vi.fn(),
    openSelectedWebEditor: vi.fn(),
    openSettings: vi.fn(),
    refreshWorkspace: vi.fn(),
    renameSelectedFolder: vi.fn(),
    reopenLastClosedTab: vi.fn(),
    saveNote: vi.fn(),
    setEditorMode: vi.fn(),
    splitPaneRight: vi.fn(),
    toggleInspector: vi.fn(),
    toggleNavigator: vi.fn(),
    toggleTheme: vi.fn(),
    toggleWorkspaceRail: vi.fn(),
    ...overrides,
  };
}

function createOptions(overrides: Partial<WorkbenchActionsOptions> = {}): WorkbenchActionsOptions {
  return {
    canCreate: true,
    canModifySelectedFolder: false,
    editorMode: 'standard',
    handlers: createHandlers(),
    hasActiveTab: true,
    hasToken: true,
    inspectorCollapsed: true,
    isSavingNote: false,
    navigatorCollapsed: false,
    noteDirty: true,
    scopeType: 'personal',
    selectedFolderId: null,
    selectedNoteId: 'note-1',
    workspaceRailCollapsed: false,
    workspaceState: createWorkspaceState(),
    ...overrides,
  };
}

describe('useWorkbenchActions', () => {
  it('runs save-note only when the action context allows saving', () => {
    const handlers = createHandlers();
    const { result, rerender } = renderHook((props: WorkbenchActionsOptions) => useWorkbenchActions(props), {
      initialProps: createOptions({ handlers }),
    });

    result.current.runAction('save-note');
    expect(handlers.saveNote).toHaveBeenCalledOnce();

    rerender(createOptions({ handlers, noteDirty: false }));
    result.current.runAction('save-note');
    expect(handlers.saveNote).toHaveBeenCalledOnce();

    rerender(createOptions({ handlers, isSavingNote: true }));
    result.current.runAction('save-note');
    expect(handlers.saveNote).toHaveBeenCalledOnce();
  });

  it('routes find-in-note to the note search handler', () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useWorkbenchActions(createOptions({ handlers })));

    result.current.runAction('find-in-note');

    expect(handlers.findInNote).toHaveBeenCalledOnce();
  });

  it('routes attach-image to the attachment handler', () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useWorkbenchActions(createOptions({ handlers })));

    result.current.runAction('attach-image');

    expect(handlers.attachImage).toHaveBeenCalledOnce();
  });

  it('routes editor mode actions and ignores the active mode', () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useWorkbenchActions(createOptions({ handlers })));

    result.current.runAction('set-editor-mode-standard');
    result.current.runAction('set-editor-mode-vim');
    result.current.runAction('set-editor-mode-helix');

    expect(handlers.setEditorMode).toHaveBeenNthCalledWith(1, 'vim');
    expect(handlers.setEditorMode).toHaveBeenNthCalledWith(2, 'helix');
    expect(handlers.setEditorMode).toHaveBeenCalledTimes(2);
  });

  it('duplicates the active tab for New Tab and opens the palette when no tab is active', () => {
    const handlers = createHandlers();
    const { result, rerender } = renderHook((props: WorkbenchActionsOptions) => useWorkbenchActions(props), {
      initialProps: createOptions({ handlers, hasActiveTab: true }),
    });

    result.current.runAction('new-tab');
    expect(handlers.duplicateActiveTab).toHaveBeenCalledOnce();
    expect(handlers.focusEditor).toHaveBeenCalledOnce();
    expect(handlers.openPalette).not.toHaveBeenCalled();

    rerender(createOptions({ handlers, hasActiveTab: false, workspaceState: createWorkspaceState([]) }));
    result.current.runAction('new-tab');
    expect(handlers.duplicateActiveTab).toHaveBeenCalledOnce();
    expect(handlers.openPalette).toHaveBeenCalledOnce();
  });

  it('does not run disabled actions', () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useWorkbenchActions(createOptions({
      handlers,
      selectedNoteId: null,
      workspaceState: createWorkspaceState([]),
    })));

    result.current.runAction('save-note');
    result.current.runAction('find-in-note');

    expect(handlers.saveNote).not.toHaveBeenCalled();
    expect(handlers.findInNote).not.toHaveBeenCalled();
  });

  it('routes back and forward navigation only when history is available', () => {
    const handlers = createHandlers();
    const { result, rerender } = renderHook((props: WorkbenchActionsOptions) => useWorkbenchActions(props), {
      initialProps: createOptions({ handlers }),
    });

    result.current.runAction('navigate-back');
    result.current.runAction('navigate-forward');
    expect(handlers.navigateBack).not.toHaveBeenCalled();
    expect(handlers.navigateForward).not.toHaveBeenCalled();

    rerender(createOptions({
      handlers,
      workspaceState: {
        ...createWorkspaceState(),
        backStack: [{ paneId: 'pane-1', tabId: 'tab-1' }],
        forwardStack: [{ paneId: 'pane-1', tabId: 'tab-1' }],
      },
    }));
    result.current.runAction('navigate-back');
    result.current.runAction('navigate-forward');

    expect(handlers.navigateBack).toHaveBeenCalledOnce();
    expect(handlers.navigateForward).toHaveBeenCalledOnce();
  });
});
