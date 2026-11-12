import { useCallback, useEffect } from 'react';

import type {
  DocumentSummary,
  RepositoryValue,
} from '@/lib/electron-api';
import type { LocalRevision } from '@/lib/local-vault';
import { isNoteNotFoundError, isRemoteNoteChangedError } from '@/lib/note-errors';

import type { DocumentSyncState } from './DocumentDetail';
import type { DocumentPaneView } from './DocumentWorkspace';
import {
  getLocalRevision,
  localRevisionsEqual,
} from './local-vault-adapter';
import {
  getSavedTabNoteIdentity,
  getNoteIdentityKey,
  isBlankNoteTab,
  isDraftNoteTab,
  isMeaningfulDraft,
  noteIdentityMatches,
  type NoteDocumentDraft,
  type NoteIdentity,
  type NotePane,
  type OpenNoteTab,
} from './note-workspace';
import {
  draftSyncKey,
  getSyncSaveFailure,
  isSyncDeleting,
  isSyncSaving,
  isSyncUploading,
  noteSyncKey,
  type SyncActivityState,
} from './note-sync-activity';
import {
  getRepositoryError,
  isShowingCachedFallback,
  unwrapRepositoryValue,
} from './repository';

export type WorkbenchDocumentQueryState = {
  isFetching?: boolean;
  isLoading?: boolean;
};

export type WorkbenchDocumentsOptions = {
  activeTab: OpenNoteTab | null;
  clearDraft: (tabId: string) => void;
  documentQueriesByKey: Map<string, WorkbenchDocumentQueryState | undefined>;
  documentsByKey: Map<string, RepositoryValue<DocumentSummary> | undefined>;
  drafts: Record<string, NoteDocumentDraft>;
  latestLocalRevisionByNoteId?: Map<string, LocalRevision>;
  /** Each note's own save, delete and upload progress. */
  syncActivity: SyncActivityState;
  tabs: Record<string, OpenNoteTab>;
  updateDraft: (tabId: string, draft: NoteDocumentDraft) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? '');
}

export function useWorkbenchDocuments({
  activeTab,
  clearDraft,
  documentQueriesByKey,
  documentsByKey,
  drafts,
  latestLocalRevisionByNoteId,
  syncActivity,
  tabs,
  updateDraft,
}: WorkbenchDocumentsOptions) {
  const getTabIdentity = useCallback((tab: OpenNoteTab): NoteIdentity => ({
    id: getSavedTabNoteIdentity(tab)?.id ?? '',
    teamPath: getSavedTabNoteIdentity(tab)?.teamPath ?? null,
  }), []);

  // A draft has no note yet, so its progress is kept under its tab; a saved note's under the note.
  const getTabSyncKey = useCallback((tab: OpenNoteTab) => (
    isDraftNoteTab(tab) ? draftSyncKey(tab.tabId) : noteSyncKey(getTabIdentity(tab))
  ), [getTabIdentity]);

  const getTabDocumentResult = useCallback((tab: OpenNoteTab) => (
    isDraftNoteTab(tab) || isBlankNoteTab(tab)
      ? undefined
      : documentsByKey.get(getNoteIdentityKey(getTabIdentity(tab)))
  ), [documentsByKey, getTabIdentity]);

  const getTabDocument = useCallback((tab: OpenNoteTab) => {
    const result = getTabDocumentResult(tab);
    // Cached content of a note that is confirmed gone must not be edited or saved as the original.
    if (isNoteNotFoundError(getRepositoryError(result))) return undefined;
    const documentResult = unwrapRepositoryValue(result);
    return documentResult && noteIdentityMatches(documentResult, getTabIdentity(tab)) ? documentResult : undefined;
  }, [getTabDocumentResult, getTabIdentity]);

  const getTabDraft = useCallback((tab: OpenNoteTab) => drafts[tab.tabId] ?? null, [drafts]);

  useEffect(() => {
    for (const tab of Object.values(tabs)) {
      if (isDraftNoteTab(tab) || isBlankNoteTab(tab)) continue;
      const draft = drafts[tab.tabId];
      if (!draft) continue;
      const documentResult = getTabDocumentResult(tab);
      const document = getTabDocument(tab);
      const query = documentQueriesByKey.get(getNoteIdentityKey(getTabIdentity(tab)));
      // Cached or pending reads cannot confirm that a recovered draft is saved.
      if (query?.isLoading || query?.isFetching || documentResult?.source !== 'remote') continue;
      const latestRevision = latestLocalRevisionByNoteId?.get(tab.noteId);
      if (latestRevision && !localRevisionsEqual(getLocalRevision(document), latestRevision)) continue;
      if (document && draft.title === document.title && draft.content === document.content) {
        clearDraft(tab.tabId);
      }
    }
  }, [clearDraft, documentQueriesByKey, drafts, getTabDocument, getTabDocumentResult, getTabIdentity, latestLocalRevisionByNoteId, tabs]);

  const getTabTitle = useCallback((tab: OpenNoteTab) => {
    if (isBlankNoteTab(tab)) {
      return tab.title;
    }

    if (isDraftNoteTab(tab)) {
      return getTabDraft(tab)?.title ?? tab.title;
    }

    const documentResult = getTabDocument(tab);
    return getTabDraft(tab)?.title ?? documentResult?.title ?? tab.title;
  }, [getTabDocument, getTabDraft]);

  const getTabContent = useCallback((tab: OpenNoteTab) => {
    if (isBlankNoteTab(tab) || isDraftNoteTab(tab)) {
      return getTabDraft(tab)?.content ?? '';
    }

    const documentResult = getTabDocument(tab);
    return getTabDraft(tab)?.content ?? documentResult?.content ?? '';
  }, [getTabDocument, getTabDraft]);

  const isTabDirty = useCallback((tab: OpenNoteTab) => {
    if (isBlankNoteTab(tab)) {
      return false;
    }
    // A new note's draft counts once it holds something worth keeping, as persistence decides.
    if (isDraftNoteTab(tab)) {
      return isMeaningfulDraft(getTabDraft(tab));
    }

    const documentResult = getTabDocument(tab);
    const draft = getTabDraft(tab);
    const baseTitle = documentResult?.title ?? draft?.baseTitle;
    const baseContent = documentResult?.content ?? draft?.baseContent;
    return Boolean(
      draft
      && typeof baseTitle === 'string'
      && typeof baseContent === 'string'
      && (draft.title !== baseTitle || draft.content !== baseContent),
    );
  }, [getTabDocument, getTabDraft]);

  const selectedDocument = activeTab ? getTabDocument(activeTab) : undefined;
  const documentTitle = activeTab ? getTabTitle(activeTab) : '';
  const documentContent = activeTab ? getTabContent(activeTab) : '';
  // A new note can always be saved, even before anything is typed: Save asks where it goes. Only
  // closing and quitting skip a draft that holds nothing (isTabDirty).
  const noteDirty = activeTab ? isDraftNoteTab(activeTab) || isTabDirty(activeTab) : false;

  const getTabDiskChanged = useCallback((tab: OpenNoteTab) => {
    if (isDraftNoteTab(tab) || isBlankNoteTab(tab)) {
      return false;
    }

    const latestRevision = latestLocalRevisionByNoteId?.get(tab.noteId) ?? null;
    if (!latestRevision) {
      return false;
    }

    const draft = getTabDraft(tab);
    const documentResult = getTabDocument(tab);
    const baseRevision = draft?.baseRevision ?? getLocalRevision(documentResult) ?? tab.localRevision ?? null;
    return Boolean(baseRevision && !localRevisionsEqual(baseRevision, latestRevision));
  }, [getTabDocument, getTabDraft, latestLocalRevisionByNoteId]);

  const getTabSyncState = useCallback((tab: OpenNoteTab): DocumentSyncState => {
    if (isBlankNoteTab(tab)) {
      return 'saved';
    }

    const syncKey = getTabSyncKey(tab);
    if (isDraftNoteTab(tab)) {
      if (isSyncSaving(syncActivity, syncKey)) {
        return 'saving';
      }

      if (getSyncSaveFailure(syncActivity, syncKey)) {
        return 'save_failed';
      }

      return 'idle';
    }

    const identity = getTabIdentity(tab);
    const documentResult = getTabDocumentResult(tab);
    const documentResultValue = unwrapRepositoryValue(documentResult);
    const documentMissing = isNoteNotFoundError(getRepositoryError(documentResult));
    const documentIsStale = Boolean(documentResultValue && !noteIdentityMatches(documentResultValue, identity));
    const documentQuery = documentQueriesByKey.get(getNoteIdentityKey(identity));
    const isSavingTab = isSyncSaving(syncActivity, syncKey);
    const saveFailedTab = Boolean(getSyncSaveFailure(syncActivity, syncKey));

    if (documentIsStale || ((documentQuery?.isLoading || documentQuery?.isFetching) && !documentResultValue)) {
      return 'loading';
    }

    if (isSavingTab) {
      return 'saving';
    }

    if (saveFailedTab) {
      return 'save_failed';
    }

    // Unsaved edits on a file that changed on disk need a choice, not a retry.
    if (isTabDirty(tab) && getTabDiskChanged(tab)) {
      return 'conflict';
    }

    if (
      documentMissing
      || (getRepositoryError(documentResult) && !isShowingCachedFallback(documentResult))
    ) {
      return 'save_failed';
    }

    if (isTabDirty(tab)) {
      return 'idle';
    }

    if (isShowingCachedFallback(documentResult)) {
      return 'cached';
    }

    // A background tab that has not loaded yet has no unsaved changes either.
    return 'saved';
  }, [
    documentQueriesByKey,
    getTabDocumentResult,
    getTabDiskChanged,
    getTabIdentity,
    getTabSyncKey,
    isTabDirty,
    syncActivity,
  ]);

  const handleDocumentTitleChange = useCallback((tab: OpenNoteTab, nextTitle: string) => {
    if (isDraftNoteTab(tab)) {
      const currentDraft = getTabDraft(tab);
      updateDraft(tab.tabId, {
        title: nextTitle,
        content: currentDraft?.content ?? '',
      });
      return;
    }

    const documentResult = getTabDocument(tab);
    if (!documentResult) {
      return;
    }

    const currentDraft = getTabDraft(tab);
    const baseRevision = getLocalRevision(documentResult);
    updateDraft(tab.tabId, {
      title: nextTitle,
      content: currentDraft?.content ?? documentResult.content,
      baseTitle: currentDraft?.baseTitle ?? documentResult.title,
      baseContent: currentDraft?.baseContent ?? documentResult.content,
      ...(currentDraft?.baseRevision ?? baseRevision ? { baseRevision: currentDraft?.baseRevision ?? baseRevision ?? undefined } : {}),
    });
  }, [getTabDocument, getTabDraft, updateDraft]);

  const getTabUnavailable = useCallback((tab: OpenNoteTab): DocumentPaneView['unavailable'] => {
    if (isDraftNoteTab(tab)) return null;
    const error = getRepositoryError(getTabDocumentResult(tab));
    if (!error) return null;
    const draft = getTabDraft(tab);
    const isRetrying = !!documentQueriesByKey.get(getNoteIdentityKey(getTabIdentity(tab)))?.isFetching;
    if (isNoteNotFoundError(error)) return { kind: 'missing', message: error, hasDraft: !!draft, isRetrying };
    // A cached copy is still usable; only a read without any document blocks the editor.
    if (getTabDocument(tab)) return null;
    return { kind: 'read_error', message: error, hasDraft: !!draft, isRetrying };
  }, [documentQueriesByKey, getTabDocument, getTabDocumentResult, getTabDraft, getTabIdentity]);

  const getTabRecovery = useCallback((tab: OpenNoteTab): DocumentPaneView['recovery'] => {
    const failure = getSyncSaveFailure(syncActivity, getTabSyncKey(tab));
    const message = failure ? errorMessage(failure.error) : '';
    if (isDraftNoteTab(tab)) {
      return message ? { kind: 'save_failed', message } : null;
    }

    if (failure && isRemoteNoteChangedError(message)) {
      return { kind: 'remote_changed', message };
    }

    if (failure && message.toLowerCase().includes('file changed on disk')) {
      return {
        kind: 'disk_changed',
        message,
      };
    }

    if (isTabDirty(tab) && getTabDiskChanged(tab)) {
      return {
        kind: 'disk_changed',
        message: 'File changed on disk. Reload it or save a copy before writing.',
      };
    }

    return null;
  }, [getTabDiskChanged, getTabSyncKey, isTabDirty, syncActivity]);

  const handleDocumentContentChange = useCallback((tab: OpenNoteTab, nextContent: string) => {
    if (isDraftNoteTab(tab)) {
      const currentDraft = getTabDraft(tab);
      updateDraft(tab.tabId, {
        title: currentDraft?.title ?? tab.title,
        content: nextContent,
      });
      return;
    }

    const documentResult = getTabDocument(tab);
    if (!documentResult) {
      return;
    }

    const currentDraft = getTabDraft(tab);
    const baseRevision = getLocalRevision(documentResult);
    updateDraft(tab.tabId, {
      title: currentDraft?.title ?? documentResult.title,
      content: nextContent,
      baseTitle: currentDraft?.baseTitle ?? documentResult.title,
      baseContent: currentDraft?.baseContent ?? documentResult.content,
      ...(currentDraft?.baseRevision ?? baseRevision ? { baseRevision: currentDraft?.baseRevision ?? baseRevision ?? undefined } : {}),
    });
  }, [getTabDocument, getTabDraft, updateDraft]);

  const getPaneTabs = useCallback((pane: NotePane) => (
    pane.tabIds
      .map((tabId) => tabs[tabId])
      .filter((tab): tab is OpenNoteTab => Boolean(tab))
      .map((tab) => ({ ...tab, title: getTabTitle(tab) }))
  ), [getTabTitle, tabs]);

  const getPaneView = useCallback((pane: NotePane): DocumentPaneView => {
    const tab = pane.activeTabId ? tabs[pane.activeTabId] ?? null : null;
    const documentResult = tab ? getTabDocumentResult(tab) : undefined;
    const documentValue = tab ? getTabDocument(tab) : undefined;
    const syncState = tab ? getTabSyncState(tab) : 'idle';
    const identity = tab && !isDraftNoteTab(tab) && !isBlankNoteTab(tab) ? getTabIdentity(tab) : null;
    const noteKey = identity ? noteSyncKey(identity) : null;
    const isSavingTab = Boolean(noteKey && isSyncSaving(syncActivity, noteKey));
    const isSavingDraftTab = Boolean(tab && isDraftNoteTab(tab) && isSyncSaving(syncActivity, draftSyncKey(tab.tabId)));
    const isUploadingTab = Boolean(noteKey && isSyncUploading(syncActivity, noteKey));
    const isDeletingTab = Boolean(noteKey && isSyncDeleting(syncActivity, noteKey));

    return {
      pane,
      activeTab: tab,
      selectedNote: tab ? { id: identity?.id, teamPath: identity?.teamPath, title: getTabTitle(tab) } : null,
      document: documentValue,
      isBlank: Boolean(tab && isBlankNoteTab(tab)),
      isDraft: Boolean(tab && isDraftNoteTab(tab)),
      title: tab ? getTabTitle(tab) : '',
      content: tab ? getTabContent(tab) : '',
      recovery: tab ? getTabRecovery(tab) : null,
      unavailable: tab ? getTabUnavailable(tab) : null,
      isLoading: syncState === 'loading' && !isShowingCachedFallback(documentResult),
      syncState,
      isSaving: isSavingTab || isSavingDraftTab,
      isSavingMetadata: isSavingTab,
      isUploadingImage: isUploadingTab,
      isDeleting: isDeletingTab,
    };
  }, [
    getTabContent,
    getTabDocument,
    getTabDocumentResult,
    getTabRecovery,
    getTabIdentity,
    getTabSyncState,
    getTabTitle,
    getTabUnavailable,
    syncActivity,
    tabs,
  ]);

  return {
    documentContent,
    documentTitle,
    getPaneTabs,
    getPaneView,
    getTabContent,
    getTabDocument,
    getTabDocumentResult,
    getTabIdentity,
    getTabDiskChanged,
    getTabSyncState,
    getTabTitle,
    handleDocumentContentChange,
    handleDocumentTitleChange,
    isTabDirty,
    noteDirty,
    selectedDocument,
  };
}
