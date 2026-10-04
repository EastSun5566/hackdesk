import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, RepositoryValue } from '@/lib/electron-api';
import type { LocalRevision } from '@/lib/local-vault';
import { HACKMD_NOTE_CHANGED_MESSAGE, HACKMD_NOTE_NOT_FOUND_MESSAGE, LOCAL_NOTE_NOT_FOUND_MESSAGE } from '@/lib/note-errors';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
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

function localRevision(contentHash: string, mtimeMs: number): LocalRevision {
  return { contentHash, mtimeMs };
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
    clearDraft: vi.fn(),
    deletingNote: null,
    documentQueriesByKey: new Map([[getNoteIdentityKey(identity), { isFetching: false, isLoading: false }]]),
    documentsByKey: new Map([[getNoteIdentityKey(identity), remoteDocument(document)]]),
    drafts: {},
    isDeletingNote: false,
    isSavingNote: false,
    isUploadingImage: false,
    saveError: null,
    saveFailedNote: null,
    savingNote: null,
    tabs: { [tab.tabId]: tab },
    updateDraft: vi.fn(),
    uploadingNote: null,
    ...overrides,
  };
}

describe('useWorkbenchDocuments', () => {
  it('clears recovered drafts only when a completed fresh read matches both title and content', () => {
    const tab = createTab();
    const key = getNoteIdentityKey({ id: tab.noteId, teamPath: tab.teamPath });
    const clearDraft = vi.fn();
    const document = createDocument();
    const options = createOptions({
      clearDraft,
      drafts: { [tab.tabId]: {
        title: document.title, content: document.content,
        baseTitle: 'Older title', baseContent: 'Older body',
      } },
    });
    const { rerender } = renderHook((props: WorkbenchDocumentsOptions) => useWorkbenchDocuments(props), {
      initialProps: { ...options, documentsByKey: new Map() },
    });
    expect(clearDraft).not.toHaveBeenCalled();
    rerender({ ...options, documentQueriesByKey: new Map([[key, { isFetching: true }]]) });
    expect(clearDraft).not.toHaveBeenCalled();
    rerender({ ...options, documentsByKey: new Map([[key, { source: 'error', error: 'offline', data: document }]]) });
    expect(clearDraft).not.toHaveBeenCalled();
    rerender({ ...options, documentsByKey: new Map([[key, { source: 'cached', data: document }]]) });
    expect(clearDraft).not.toHaveBeenCalled();
    rerender({ ...options, latestLocalRevisionByNoteId: new Map([[tab.noteId, localRevision('newer', 2)]]) });
    expect(clearDraft).not.toHaveBeenCalled();
    rerender({ ...options, documentsByKey: new Map([[key, remoteDocument({ ...document, content: 'Different body' })]]) });
    expect(clearDraft).not.toHaveBeenCalled();
    rerender({ ...options, documentsByKey: new Map([[key, remoteDocument({ ...document, title: 'Different title' })]]) });
    expect(clearDraft).not.toHaveBeenCalled();
    rerender(options);
    expect(clearDraft).toHaveBeenCalledExactlyOnceWith(tab.tabId);
  });

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
        documentsByKey: new Map(),
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

  it('keeps the active editor mounted during background document refetches', () => {
    const tab = createTab();
    const pane = createPane(tab);
    const identity = { id: tab.noteId, teamPath: tab.teamPath };
    const key = getNoteIdentityKey(identity);
    const { result } = renderHook(() => useWorkbenchDocuments(createOptions({
      documentQueriesByKey: new Map([[key, { isFetching: true, isLoading: false }]]),
    })));

    expect(result.current.getTabSyncState(tab)).toBe('saved');
    expect(result.current.getPaneView(pane).isLoading).toBe(false);
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

  it('exposes disk changed recovery only for matching failed local saves', () => {
    const tab = createTab();
    const pane = createPane(tab);
    const identity = { id: tab.noteId, teamPath: tab.teamPath };
    const { result, rerender } = renderHook((props: WorkbenchDocumentsOptions) => useWorkbenchDocuments(props), {
      initialProps: createOptions({
        saveError: new Error('File changed on disk. Reload it or save a copy before writing.'),
        saveFailedNote: identity,
        tabs: { [tab.tabId]: tab },
      }),
    });

    expect(result.current.getPaneView(pane).recovery).toEqual({
      kind: 'disk_changed',
      message: 'File changed on disk. Reload it or save a copy before writing.',
    });

    rerender(createOptions({
      saveError: new Error('Network failed.'),
      saveFailedNote: identity,
      tabs: { [tab.tabId]: tab },
    }));

    expect(result.current.getPaneView(pane).recovery).toBeNull();
  });

  it('exposes HackMD change recovery only for the note whose save was rejected', () => {
    const tab = createTab();
    const other = createTab({ noteId: 'note-2', tabId: 'tab-2' });
    const options = createOptions({
      saveError: new Error(HACKMD_NOTE_CHANGED_MESSAGE),
      saveFailedNote: { id: tab.noteId, teamPath: tab.teamPath },
      tabs: { [tab.tabId]: tab, [other.tabId]: other },
    });
    const { result } = renderHook(() => useWorkbenchDocuments(options));

    expect(result.current.getPaneView(createPane(tab)).recovery).toEqual({ kind: 'remote_changed', message: HACKMD_NOTE_CHANGED_MESSAGE });
    expect(result.current.getPaneView(createPane(tab)).syncState).toBe('save_failed');
    expect(result.current.getPaneView(createPane(other)).recovery).toBeNull();
  });

  it('marks dirty local tabs as failed when the file changed on disk', () => {
    const baseRevision = localRevision('old', 1);
    const latestRevision = localRevision('new', 2);
    const tab = createTab({
      localRevision: baseRevision,
      teamPath: LOCAL_VAULT_TEAM_PATH,
    });
    const pane = createPane(tab);
    const identity = { id: tab.noteId, teamPath: tab.teamPath };
    const key = getNoteIdentityKey(identity);
    const document = createDocument({
      id: tab.noteId,
      teamPath: LOCAL_VAULT_TEAM_PATH,
    }) as DocumentSummary & { localRevision: LocalRevision };
    document.localRevision = baseRevision;
    const { result } = renderHook(() => useWorkbenchDocuments(createOptions({
      activeTab: tab,
      documentsByKey: new Map([[key, remoteDocument(document)]]),
      drafts: {
        [tab.tabId]: {
          baseContent: 'Body',
          baseRevision,
          baseTitle: 'Document title',
          content: 'Draft body',
          title: 'Document title',
        },
      },
      latestLocalRevisionByNoteId: new Map([[tab.noteId, latestRevision]]),
      tabs: { [tab.tabId]: tab },
    })));

    expect(result.current.getTabSyncState(tab)).toBe('save_failed');
    expect(result.current.getPaneView(pane).recovery).toEqual({
      kind: 'disk_changed',
      message: 'File changed on disk. Reload it or save a copy before writing.',
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

  describe('unavailable original notes', () => {
    const tab = createTab({ teamPath: LOCAL_VAULT_TEAM_PATH });
    const key = getNoteIdentityKey({ id: tab.noteId, teamPath: tab.teamPath });
    const draft = { title: 'Edited title', content: 'Edited body', baseTitle: 'Document title', baseContent: 'Body' };
    const optionsWith = (result: RepositoryValue<DocumentSummary> | undefined, query = { isFetching: false, isLoading: false }) => createOptions({
      activeTab: tab,
      tabs: { [tab.tabId]: tab },
      drafts: { [tab.tabId]: draft },
      documentQueriesByKey: new Map([[key, query]]),
      documentsByKey: new Map([[key, result]]),
    });

    it.each([
      ['local deletion', LOCAL_NOTE_NOT_FOUND_MESSAGE],
      ['remote missing note', HACKMD_NOTE_NOT_FOUND_MESSAGE],
    ])('treats %s as missing, ignores cached content and keeps the draft', (_, error) => {
      const clearDraft = vi.fn();
      const document = createDocument({ teamPath: tab.teamPath });
      const options = { ...optionsWith({ source: 'error', error: `Error invoking remote method: Error: ${error}`, data: document }), clearDraft };
      const { result } = renderHook(() => useWorkbenchDocuments(options));
      const view = result.current.getPaneView(createPane(tab));
      expect(view.document).toBeUndefined();
      expect(view.unavailable).toMatchObject({ kind: 'missing', hasDraft: true });
      expect(view).toMatchObject({ title: 'Edited title', content: 'Edited body', syncState: 'save_failed' });
      expect(result.current.isTabDirty(tab)).toBe(true);
      expect(clearDraft).not.toHaveBeenCalled();
    });

    it('reports a temporary read error without a document, but keeps a usable cached copy editable', () => {
      const failed = renderHook(() => useWorkbenchDocuments(optionsWith({ source: 'error', error: 'EACCES: permission denied' })));
      expect(failed.result.current.getPaneView(createPane(tab)).unavailable).toEqual({
        kind: 'read_error', message: 'EACCES: permission denied', hasDraft: true, isRetrying: false,
      });
      const cached = renderHook(() => useWorkbenchDocuments(optionsWith({ source: 'error', error: 'offline', data: createDocument({ teamPath: tab.teamPath }) })));
      expect(cached.result.current.getPaneView(createPane(tab))).toMatchObject({ unavailable: null, document: { id: 'note-1' } });
    });

    it('shows loading, not an unavailable note, while the first read is pending', () => {
      const { result } = renderHook(() => useWorkbenchDocuments(optionsWith(undefined, { isFetching: true, isLoading: true })));
      expect(result.current.getPaneView(createPane(tab))).toMatchObject({ isLoading: true, unavailable: null });
    });

    it('keeps independent drafts for two missing notes', () => {
      const second = createTab({ tabId: 'tab-2', noteId: 'note-2', teamPath: LOCAL_VAULT_TEAM_PATH });
      const secondKey = getNoteIdentityKey({ id: second.noteId, teamPath: second.teamPath });
      const missing: RepositoryValue<DocumentSummary> = { source: 'error', error: LOCAL_NOTE_NOT_FOUND_MESSAGE };
      const { result } = renderHook(() => useWorkbenchDocuments(createOptions({
        activeTab: tab,
        tabs: { [tab.tabId]: tab, [second.tabId]: second },
        drafts: { [tab.tabId]: draft, [second.tabId]: { ...draft, title: 'Second', content: 'Second body' } },
        documentQueriesByKey: new Map([[key, { isFetching: false }], [secondKey, { isFetching: false }]]),
        documentsByKey: new Map([[key, missing], [secondKey, missing]]),
      })));
      expect(result.current.getPaneView(createPane(tab))).toMatchObject({ content: 'Edited body', unavailable: { kind: 'missing' } });
      expect(result.current.getPaneView(createPane(second))).toMatchObject({ content: 'Second body', unavailable: { kind: 'missing' } });
    });
  });
});
