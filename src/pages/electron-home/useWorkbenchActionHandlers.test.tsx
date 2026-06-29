import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';
import type { OpenNoteTab } from './note-workspace';
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

function createTab(overrides: Partial<OpenNoteTab> = {}): OpenNoteTab {
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

function createOptions(overrides: Partial<WorkbenchActionHandlersOptions> = {}): WorkbenchActionHandlersOptions {
  return {
    activePaneId: 'pane-1',
    activeTab: createTab(),
    api: undefined,
    bumpAttachImageRequest: vi.fn(),
    bumpEditorSearchRequest: vi.fn(),
    createFolder: vi.fn(),
    createNote: vi.fn(),
    deleteNote: vi.fn(),
    documentContent: 'Draft body',
    documentTitle: 'Draft title',
    duplicateActiveTab: vi.fn(),
    exportMarkdown: vi.fn(),
    focusNextPane: vi.fn(),
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
    openPalette: vi.fn(),
    refreshWorkspace: vi.fn(),
    renameFolder: vi.fn(),
    requestCloseOtherTabs: vi.fn(async () => undefined),
    requestCloseTab: vi.fn(async () => true),
    requestCloseTabsToRight: vi.fn(async () => undefined),
    requestDeleteFolder: vi.fn(),
    reopenLastClosedTab: vi.fn(),
    saveNote: vi.fn(),
    selectedDocument: createDocument(),
    selectedFolderId: 'folder-1',
    setSettingsOpen: vi.fn(),
    splitActiveTab: vi.fn(),
    switchToHistory: vi.fn(),
    toggleInspector: vi.fn(),
    toggleNavigator: vi.fn(),
    toggleTheme: vi.fn(),
    toggleWorkspaceRail: vi.fn(),
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
    expect(focusZone).toHaveBeenCalledWith('editor');
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
