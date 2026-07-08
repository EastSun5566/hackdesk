import { useCallback } from 'react';

import type {
  DocumentSummary,
  RepositoryValue,
} from '@/lib/electron-api';
import type { LocalRevision } from '@/lib/local-vault';

import type { DocumentSyncState } from './DocumentDetail';
import type { DocumentPaneView } from './DocumentWorkspace';
import {
  getLocalRevision,
  localRevisionsEqual,
} from './local-vault-adapter';
import {
  getSavedTabNoteIdentity,
  getNoteIdentityKey,
  isDraftNoteTab,
  noteIdentityMatches,
  type NoteDocumentDraft,
  type NoteIdentity,
  type NotePane,
  type OpenNoteTab,
} from './note-workspace';
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
  deletingNote: NoteIdentity | null;
  documentQueriesByKey: Map<string, WorkbenchDocumentQueryState | undefined>;
  documentsByKey: Map<string, RepositoryValue<DocumentSummary> | undefined>;
  drafts: Record<string, NoteDocumentDraft>;
  isDeletingNote: boolean;
  isSavingNote: boolean;
  isSavingDraftNote?: boolean;
  isUploadingImage: boolean;
  latestLocalRevisionByNoteId?: Map<string, LocalRevision>;
  saveError: unknown;
  draftSaveError?: unknown;
  saveFailedNote: NoteIdentity | null;
  saveFailedDraftTabId?: string | null;
  savingDraftTabId?: string | null;
  savingNote: NoteIdentity | null;
  tabs: Record<string, OpenNoteTab>;
  updateDraft: (tabId: string, draft: NoteDocumentDraft) => void;
  uploadingNote: NoteIdentity | null;
};

export function useWorkbenchDocuments({
  activeTab,
  deletingNote,
  documentQueriesByKey,
  documentsByKey,
  drafts,
  isDeletingNote,
  isSavingNote,
  isSavingDraftNote = false,
  isUploadingImage,
  latestLocalRevisionByNoteId,
  saveError,
  draftSaveError,
  saveFailedNote,
  saveFailedDraftTabId = null,
  savingDraftTabId = null,
  savingNote,
  tabs,
  updateDraft,
  uploadingNote,
}: WorkbenchDocumentsOptions) {
  const getTabIdentity = useCallback((tab: OpenNoteTab): NoteIdentity => ({
    id: getSavedTabNoteIdentity(tab)?.id ?? '',
    teamPath: getSavedTabNoteIdentity(tab)?.teamPath ?? null,
  }), []);

  const getTabDocumentResult = useCallback((tab: OpenNoteTab) => (
    isDraftNoteTab(tab)
      ? undefined
      : documentsByKey.get(getNoteIdentityKey(getTabIdentity(tab)))
  ), [documentsByKey, getTabIdentity]);

  const getTabDocument = useCallback((tab: OpenNoteTab) => {
    const documentResult = unwrapRepositoryValue(getTabDocumentResult(tab));
    return documentResult && noteIdentityMatches(documentResult, getTabIdentity(tab)) ? documentResult : undefined;
  }, [getTabDocumentResult, getTabIdentity]);

  const getTabDraft = useCallback((tab: OpenNoteTab) => drafts[tab.tabId] ?? null, [drafts]);

  const getTabTitle = useCallback((tab: OpenNoteTab) => {
    if (isDraftNoteTab(tab)) {
      return getTabDraft(tab)?.title ?? tab.title;
    }

    const documentResult = getTabDocument(tab);
    return getTabDraft(tab)?.title ?? documentResult?.title ?? tab.title;
  }, [getTabDocument, getTabDraft]);

  const getTabContent = useCallback((tab: OpenNoteTab) => {
    if (isDraftNoteTab(tab)) {
      return getTabDraft(tab)?.content ?? '';
    }

    const documentResult = getTabDocument(tab);
    return getTabDraft(tab)?.content ?? documentResult?.content ?? '';
  }, [getTabDocument, getTabDraft]);

  const isTabDirty = useCallback((tab: OpenNoteTab) => {
    if (isDraftNoteTab(tab)) {
      return true;
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
  const noteDirty = activeTab ? isTabDirty(activeTab) : false;

  const getTabDiskChanged = useCallback((tab: OpenNoteTab) => {
    if (isDraftNoteTab(tab)) {
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
    if (isDraftNoteTab(tab)) {
      if (isSavingDraftNote && savingDraftTabId === tab.tabId) {
        return 'saving';
      }

      if (saveFailedDraftTabId === tab.tabId) {
        return 'save_failed';
      }

      return 'idle';
    }

    const identity = getTabIdentity(tab);
    const documentResult = getTabDocumentResult(tab);
    const documentResultValue = unwrapRepositoryValue(documentResult);
    const documentIsStale = Boolean(documentResultValue && !noteIdentityMatches(documentResultValue, identity));
    const documentQuery = documentQueriesByKey.get(getNoteIdentityKey(identity));
    const isSavingTab = isSavingNote && noteIdentityMatches(savingNote, identity);
    const saveFailedTab = noteIdentityMatches(saveFailedNote, identity);

    if (documentIsStale || ((documentQuery?.isLoading || documentQuery?.isFetching) && !documentResultValue)) {
      return 'loading';
    }

    if (isSavingTab) {
      return 'saving';
    }

    if (
      saveFailedTab
      || (isTabDirty(tab) && getTabDiskChanged(tab))
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

    return documentResultValue ? 'saved' : 'idle';
  }, [
    documentQueriesByKey,
    getTabDocumentResult,
    getTabDiskChanged,
    getTabIdentity,
    isSavingDraftNote,
    isSavingNote,
    isTabDirty,
    saveFailedDraftTabId,
    saveFailedNote,
    savingDraftTabId,
    savingNote,
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

  const getTabRecovery = useCallback((tab: OpenNoteTab): DocumentPaneView['recovery'] => {
    if (isDraftNoteTab(tab)) {
      const message = draftSaveError instanceof Error ? draftSaveError.message : String(draftSaveError ?? '');
      return saveFailedDraftTabId === tab.tabId && message
        ? { kind: 'save_failed', message }
        : null;
    }

    const identity = getTabIdentity(tab);
    const message = saveError instanceof Error ? saveError.message : String(saveError ?? '');
    if (noteIdentityMatches(saveFailedNote, identity) && message.toLowerCase().includes('file changed on disk')) {
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
  }, [draftSaveError, getTabDiskChanged, getTabIdentity, isTabDirty, saveError, saveFailedDraftTabId, saveFailedNote]);

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
    const identity = tab && !isDraftNoteTab(tab) ? getTabIdentity(tab) : null;
    const isSavingTab = Boolean(identity && isSavingNote && noteIdentityMatches(savingNote, identity));
    const isSavingDraftTab = Boolean(tab && isDraftNoteTab(tab) && isSavingDraftNote && savingDraftTabId === tab.tabId);
    const isUploadingTab = Boolean(identity && isUploadingImage && noteIdentityMatches(uploadingNote, identity));
    const isDeletingTab = Boolean(identity && isDeletingNote && noteIdentityMatches(deletingNote, identity));

    return {
      pane,
      activeTab: tab,
      selectedNote: tab ? { title: getTabTitle(tab) } : null,
      document: documentValue,
      isDraft: Boolean(tab && isDraftNoteTab(tab)),
      title: tab ? getTabTitle(tab) : '',
      content: tab ? getTabContent(tab) : '',
      recovery: tab ? getTabRecovery(tab) : null,
      isLoading: syncState === 'loading' && !isShowingCachedFallback(documentResult),
      syncState,
      isSaving: isSavingTab || isSavingDraftTab,
      isSavingMetadata: isSavingTab,
      isUploadingImage: isUploadingTab,
      isDeleting: isDeletingTab,
    };
  }, [
    deletingNote,
    getTabContent,
    getTabDocument,
    getTabDocumentResult,
    getTabRecovery,
    getTabIdentity,
    getTabSyncState,
    getTabTitle,
    isDeletingNote,
    isSavingDraftNote,
    isSavingNote,
    isUploadingImage,
    savingDraftTabId,
    savingNote,
    tabs,
    uploadingNote,
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
