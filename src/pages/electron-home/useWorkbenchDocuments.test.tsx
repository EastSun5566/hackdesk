import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, RepositoryValue } from '@/lib/electron-api';

import {
  getNoteIdentityKey,
  type NoteDocumentDraft,
  type NoteIdentity,
  type NotePane,
  type OpenNoteTab,
} from './note-workspace';
import { useWorkbenchDocuments, type WorkbenchDocumentsOptions } from './useWorkbenchDocuments';

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
    shortId: 'short-1',
    tags: [],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Document title',
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
    shortId: 'short-1',
    tabId: 'tab-1',
    teamPath: null,
    title: 'Tab title',
    updatedAtMillis: null,
    ...overrides,
  };
}

function createPane(tab: OpenNoteTab): NotePane {
  return {
    activeTabId: tab.tabId,
    paneId: 'pane-1',
    size: 100,
    tabIds: [tab.tabId],
  };
}

function remoteDocument(document: DocumentSummary): RepositoryValue<DocumentSummary> {
  return { source: 'remote', data: document };
}

function createOptions(overrides: Partial<WorkbenchDocumentsOptions> = {}): WorkbenchDocumentsOptions {
  const tab = createTab();
  const document = createDocument();
  const identity: NoteIdentity = { id: tab.noteId, teamPath: tab.teamPath };

  return {
    activeTab: tab,
    deletingNote: null,
    documentQueriesByKey: new Map([[getNoteIdentityKey(identity), { isFetching: false, isLoading: false }]]),
    documentsByKey: new Map([[getNoteIdentityKey(identity), remoteDocument(document)]]),
    drafts: {},
    isDeletingNote: false,
    isSavingNote: false,
    isUploadingImage: false,
    saveFailedNote: null,
    savingNote: null,
    tabs: { [tab.tabId]: tab },
    updateDraft: vi.fn(),
    uploadingNote: null,
    ...overrides,
  };
}

describe('useWorkbenchDocuments', () => {
  it('derives dirty state from draft title and content changes', () => {
    const tab = createTab();
    const baseDraft: NoteDocumentDraft = {
      baseContent: 'Body',
      baseTitle: 'Document title',
      content: 'Body',
      title: 'Document title',
    };
    const { result, rerender } = renderHook((props: WorkbenchDocumentsOptions) => useWorkbenchDocuments(props), {
      initialProps: createOptions({
        activeTab: tab,
        drafts: { [tab.tabId]: baseDraft },
        tabs: { [tab.tabId]: tab },
      }),
    });

    expect(result.current.isTabDirty(tab)).toBe(false);
    expect(result.current.noteDirty).toBe(false);

    rerender(createOptions({
      activeTab: tab,
      drafts: { [tab.tabId]: { ...baseDraft, title: 'Draft title' } },
      tabs: { [tab.tabId]: tab },
    }));

    expect(result.current.isTabDirty(tab)).toBe(true);
    expect(result.current.noteDirty).toBe(true);
  });

  it('derives loading, cached, save failed, and saved sync states', () => {
    const tab = createTab();
    const identity = { id: tab.noteId, teamPath: tab.teamPath };
    const key = getNoteIdentityKey(identity);
    const { result, rerender } = renderHook((props: WorkbenchDocumentsOptions) => useWorkbenchDocuments(props), {
      initialProps: createOptions({
        documentQueriesByKey: new Map([[key, { isLoading: true }]]),
      }),
    });

    expect(result.current.getTabSyncState(tab)).toBe('loading');

    rerender(createOptions({
      documentsByKey: new Map([[key, { source: 'error', error: 'offline', data: createDocument() }]]),
    }));
    expect(result.current.getTabSyncState(tab)).toBe('cached');

    rerender(createOptions({
      documentsByKey: new Map([[key, { source: 'error', error: 'offline' }]]),
    }));
    expect(result.current.getTabSyncState(tab)).toBe('save_failed');

    rerender(createOptions({
      saveFailedNote: identity,
    }));
    expect(result.current.getTabSyncState(tab)).toBe('save_failed');

    rerender(createOptions());
    expect(result.current.getTabSyncState(tab)).toBe('saved');
  });

  it('uses draft title snapshots for pane tabs', () => {
    const tab = createTab();
    const pane = createPane(tab);
    const { result } = renderHook(() => useWorkbenchDocuments(createOptions({
      drafts: {
        [tab.tabId]: {
          baseContent: 'Body',
          baseTitle: 'Document title',
          content: 'Body',
          title: 'Draft title',
        },
      },
      tabs: { [tab.tabId]: tab },
    })));

    expect(result.current.getPaneTabs(pane)[0]).toMatchObject({ title: 'Draft title' });
  });

  it('builds pane view with active document and mutation flags', () => {
    const tab = createTab();
    const pane = createPane(tab);
    const identity = { id: tab.noteId, teamPath: tab.teamPath };
    const { result } = renderHook(() => useWorkbenchDocuments(createOptions({
      deletingNote: identity,
      isDeletingNote: true,
      isSavingNote: true,
      isUploadingImage: true,
      savingNote: identity,
      tabs: { [tab.tabId]: tab },
      uploadingNote: identity,
    })));

    expect(result.current.getPaneView(pane)).toMatchObject({
      activeTab: tab,
      content: 'Body',
      document: createDocument(),
      isDeleting: true,
      isSaving: true,
      isSavingMetadata: true,
      isUploadingImage: true,
      selectedNote: { title: 'Document title' },
      syncState: 'saving',
      title: 'Document title',
    });
  });

  it('writes title and content drafts while preserving base values', () => {
    const tab = createTab();
    const updateDraft = vi.fn();
    const { result } = renderHook(() => useWorkbenchDocuments(createOptions({
      tabs: { [tab.tabId]: tab },
      updateDraft,
    })));

    result.current.handleDocumentTitleChange(tab, 'Next title');
    result.current.handleDocumentContentChange(tab, 'Next body');

    expect(updateDraft).toHaveBeenNthCalledWith(1, tab.tabId, {
      baseContent: 'Body',
      baseTitle: 'Document title',
      content: 'Body',
      title: 'Next title',
    });
    expect(updateDraft).toHaveBeenNthCalledWith(2, tab.tabId, {
      baseContent: 'Body',
      baseTitle: 'Document title',
      content: 'Next body',
      title: 'Document title',
    });
  });
});
