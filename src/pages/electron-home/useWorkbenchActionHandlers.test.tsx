import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';

import type { DraftOpenNoteTab, SavedOpenNoteTab } from './note-workspace';
import {
  useWorkbenchActionHandlers,
  type WorkbenchActionHandlersOptions,
} from './useWorkbenchActionHandlers';

function createDocument(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: 'Body',
    createdAtMillis: null,
    description: '',
    folderPaths: [],
    id: 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'note-1',
    tags: [],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Note',
    titleUpdatedAtMillis: null,
    updatedAtMillis: null,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

function createTab(overrides: Partial<SavedOpenNoteTab> = {}): SavedOpenNoteTab {
  return {
    noteId: 'note-1',
    shortId: 'note-1',
    tabId: 'tab-1',
    teamPath: null,
    title: 'Note',
    updatedAtMillis: null,
    ...overrides,
  };
}

function createDraftTab(overrides: Partial<DraftOpenNoteTab> = {}): DraftOpenNoteTab {
  return {
    kind: 'draft',
    draftId: 'draft-1',
    shortId: null,
    tabId: 'draft-tab-1',
    title: 'Untitled',
    updatedAtMillis: null,
    ...overrides,
  };
}

function createOptions(overrides: Partial<WorkbenchActionHandlersOptions> = {}): WorkbenchActionHandlersOptions {
  return {
    activePaneId: 'pane-1',
    activePaneTabIds: ['tab-0', 'tab-1', 'tab-2'],
    activeTab: createTab(),
    api: undefined,
    book: { book: null, open: vi.fn(), close: vi.fn(), contentsHidden: false, toggleContents: vi.fn(), openChapter: vi.fn(), positionOf: vi.fn(() => null) },
    chooseLocalVault: vi.fn(),
    toggleKeyHints: vi.fn(),
    openLeaderMenu: vi.fn(),
    toggleHackMode: vi.fn(),
    openViewOptions: vi.fn(),
    bumpRenameRequest: vi.fn(),
    copyNoteLink: vi.fn(),
    copyNoteMarkdownLink: vi.fn(),
    duplicateNote: vi.fn(),
    openMoveNotePicker: vi.fn(),
    openShare: vi.fn(),
    reorderTab: vi.fn(),
    revealLocalNote: vi.fn(),
    revealLocalVault: vi.fn(async () => undefined),
    bumpAttachImageRequest: vi.fn(),
    bumpAiAssistRequest: vi.fn(),
    bumpDictateRequest: vi.fn(),
    bumpEditorSearchRequest: vi.fn(),
    createFolder: vi.fn(),
    createNote: vi.fn(),
    createNoteFromTemplate: vi.fn(),
    askNotes: vi.fn(),
    saveAsTemplate: vi.fn(),
    deleteNote: vi.fn(),
    documentContent: 'Draft body',
    documentTitle: 'Draft title',
    duplicateActiveTab: vi.fn(),
    exportMarkdown: vi.fn(),
    focusNextPane: vi.fn(),
    focusPaneToward: vi.fn(),
    togglePaneZoom: vi.fn(),
    equalizePanes: vi.fn(),
    splitActivePaneDown: vi.fn(),
    focusNextTab: vi.fn(),
    focusPreviousPane: vi.fn(),
    focusPreviousTab: vi.fn(),
    focusWorkspaceSearch: vi.fn(),
    focusZone: vi.fn(),
    importMarkdownNote: vi.fn(),
    isSavingNote: false,
    moveActiveTabToOtherPane: vi.fn(),
    navigateBack: vi.fn(),
    navigateForward: vi.fn(),
    noteDirty: true,
    openKeyboardShortcuts: vi.fn(),
    focusNextRegion: vi.fn(() => true),
    openPalette: vi.fn(),
    openQuickOpen: vi.fn(),
    refreshWorkspace: vi.fn(),
    renameFolder: vi.fn(),
    requestCloseOtherTabs: vi.fn(async () => undefined),
    requestCloseTab: vi.fn(async () => true),
    requestCloseTabsToRight: vi.fn(async () => undefined),
    requestDeleteFolder: vi.fn(),
    reopenLastClosedTab: vi.fn(),
    saveNote: vi.fn(),
    saveDraftNote: vi.fn(),
    setEditorMode: vi.fn(),
    selectedDocument: createDocument(),
    selectedFolderId: 'folder-1',
    setSettingsOpen: vi.fn(),
    setVersionsOpen: vi.fn(),
    setTrashOpen: vi.fn(),
    splitActiveTab: vi.fn(),
    switchToHistory: vi.fn(),
    toggleInspector: vi.fn(),
    toggleNavigator: vi.fn(),
    toggleTheme: vi.fn(),
    openWorkspaceSwitcher: vi.fn(),
    trackRecentNote: vi.fn(),
    ...overrides,
  };
}

describe('useWorkbenchActionHandlers', () => {
  it('saves the active note only when it has dirty content and is not already saving', () => {
    const saveNote = vi.fn();
    const selectedDocument = createDocument();
    const { result, rerender } = renderHook((props: WorkbenchActionHandlersOptions) => useWorkbenchActionHandlers(props), {
      initialProps: createOptions({ saveNote, selectedDocument }),
    });

    result.current.saveNote();
    expect(saveNote).toHaveBeenCalledWith(selectedDocument, { title: 'Draft title', content: 'Draft body' });

    rerender(createOptions({ saveNote, selectedDocument, noteDirty: false }));
    result.current.saveNote();

    rerender(createOptions({ saveNote, selectedDocument, isSavingNote: true }));
    result.current.saveNote();

    expect(saveNote).toHaveBeenCalledOnce();
  });

  it('moves the active tab past its neighbour, and acts on the selected note', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchActionHandlers(options));

    result.current.moveTab(-1);
    expect(options.reorderTab).toHaveBeenLastCalledWith('pane-1', 'tab-1', 'tab-0');
    result.current.moveTab(1);
    expect(options.reorderTab).toHaveBeenLastCalledWith('pane-1', 'tab-1', 'tab-2');

    result.current.duplicateSelectedNote();
    result.current.copyNoteLink();
    result.current.copyMarkdownLink();
    result.current.revealNoteInFinder();
    expect(options.duplicateNote).toHaveBeenCalledWith(options.selectedDocument);
    expect(options.copyNoteLink).toHaveBeenCalledWith(options.selectedDocument);
    expect(options.copyNoteMarkdownLink).toHaveBeenCalledWith(options.selectedDocument);
    expect(options.revealLocalNote).toHaveBeenCalledWith(options.selectedDocument);
  });

  it('does not move a tab past the end of its pane', () => {
    const options = createOptions({ activePaneTabIds: ['tab-1'] });
    const { result } = renderHook(() => useWorkbenchActionHandlers(options));

    result.current.moveTab(-1);
    result.current.moveTab(1);
    expect(options.reorderTab).not.toHaveBeenCalled();
  });

  it('asks the active pane to open its Rename Note dialog', () => {
    const bumpRenameRequest = vi.fn();
    const { result } = renderHook(() => useWorkbenchActionHandlers({ ...createOptions(), bumpRenameRequest }));

    result.current.renameNote();

    expect(bumpRenameRequest).toHaveBeenCalledOnce();
  });

  it('saves a draft tab through create instead of update', () => {
    const saveNote = vi.fn();
    const saveDraftNote = vi.fn();
    const activeTab = createDraftTab();
    const { result } = renderHook(() => useWorkbenchActionHandlers(createOptions({
      activeTab,
      documentContent: 'Draft body',
      documentTitle: 'Draft title',
      saveDraftNote,
      saveNote,
      selectedDocument: undefined,
    })));

    result.current.saveNote();

    expect(saveDraftNote).toHaveBeenCalledWith(activeTab, { title: 'Draft title', content: 'Draft body' });
    expect(saveNote).not.toHaveBeenCalled();
  });

  it('routes editor search and history navigation through the existing callbacks', () => {
    const bumpAttachImageRequest = vi.fn();
    const bumpEditorSearchRequest = vi.fn();
    const focusZone = vi.fn();
    const switchToHistory = vi.fn();
    const { result } = renderHook(() => useWorkbenchActionHandlers(createOptions({
      bumpAttachImageRequest,
      bumpEditorSearchRequest,
      focusZone,
      switchToHistory,
    })));

    result.current.attachImage();
    result.current.findInNote();
    result.current.goHistory();

    expect(bumpAttachImageRequest).toHaveBeenCalledOnce();
    expect(bumpEditorSearchRequest).toHaveBeenCalledOnce();
    expect(switchToHistory).toHaveBeenCalledOnce();
    expect(focusZone).toHaveBeenCalledWith('navigator');
  });

  it('keeps pane and tab focus actions paired with editor focus', () => {
    const focusNextTab = vi.fn();
    const focusPreviousPane = vi.fn();
    const focusZone = vi.fn();
    const { result } = renderHook(() => useWorkbenchActionHandlers(createOptions({
      focusNextTab,
      focusPreviousPane,
      focusZone,
    })));

    result.current.focusNextTab();
    result.current.focusPreviousPane();

    expect(focusNextTab).toHaveBeenCalledOnce();
    expect(focusPreviousPane).toHaveBeenCalledOnce();
    // Both may land in another pane, so focus waits until the move has rendered.
    expect(focusZone).toHaveBeenNthCalledWith(1, 'editor', { afterMove: true });
    expect(focusZone).toHaveBeenNthCalledWith(2, 'editor', { afterMove: true });
  });

  it('routes folder actions only when a real folder is selected', () => {
    const renameFolder = vi.fn();
    const requestDeleteFolder = vi.fn();
    const { result, rerender } = renderHook((props: WorkbenchActionHandlersOptions) => useWorkbenchActionHandlers(props), {
      initialProps: createOptions({ renameFolder, requestDeleteFolder, selectedFolderId: 'folder-1' }),
    });

    result.current.renameSelectedFolder();
    result.current.deleteSelectedFolder();

    rerender(createOptions({ renameFolder, requestDeleteFolder, selectedFolderId: null }));
    result.current.renameSelectedFolder();
    result.current.deleteSelectedFolder();

    expect(renameFolder).toHaveBeenCalledOnce();
    expect(renameFolder).toHaveBeenCalledWith('folder-1');
    expect(requestDeleteFolder).toHaveBeenCalledOnce();
    expect(requestDeleteFolder).toHaveBeenCalledWith('folder-1');
  });
});
