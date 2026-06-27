import { useCallback } from 'react';

import type {
  DocumentSummary,
  RepositoryValue,
} from '@/lib/electron-api';

import type { DocumentSyncState } from './DocumentDetail';
import type { DocumentPaneView } from './DocumentWorkspace';
import {
  getNoteIdentityKey,
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
  isUploadingImage: boolean;
  saveError: unknown;
  saveFailedNote: NoteIdentity | null;
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
  isUploadingImage,
  saveError,
  saveFailedNote,
  savingNote,
  tabs,
  updateDraft,
  uploadingNote,
}: WorkbenchDocumentsOptions) {
  const getTabIdentity = useCallback((tab: OpenNoteTab): NoteIdentity => ({
    id: tab.noteId,
    teamPath: tab.teamPath,
  }), []);

  const getTabDocumentResult = useCallback((tab: OpenNoteTab) => (
    documentsByKey.get(getNoteIdentityKey(getTabIdentity(tab)))
  ), [documentsByKey, getTabIdentity]);

  const getTabDocument = useCallback((tab: OpenNoteTab) => {
    const documentResult = unwrapRepositoryValue(getTabDocumentResult(tab));
    return documentResult && noteIdentityMatches(documentResult, getTabIdentity(tab)) ? documentResult : undefined;
  }, [getTabDocumentResult, getTabIdentity]);

  const getTabDraft = useCallback((tab: OpenNoteTab) => drafts[tab.tabId] ?? null, [drafts]);

  const getTabTitle = useCallback((tab: OpenNoteTab) => {
    const documentResult = getTabDocument(tab);
    return getTabDraft(tab)?.title ?? documentResult?.title ?? tab.title;
  }, [getTabDocument, getTabDraft]);

  const getTabContent = useCallback((tab: OpenNoteTab) => {
    const documentResult = getTabDocument(tab);
    return getTabDraft(tab)?.content ?? documentResult?.content ?? '';
  }, [getTabDocument, getTabDraft]);

  const isTabDirty = useCallback((tab: OpenNoteTab) => {
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

  const getTabSyncState = useCallback((tab: OpenNoteTab): DocumentSyncState => {
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

    if (saveFailedTab || (getRepositoryError(documentResult) && !isShowingCachedFallback(documentResult))) {
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
    getTabIdentity,
    isSavingNote,
    isTabDirty,
    saveFailedNote,
    savingNote,
  ]);

  const handleDocumentTitleChange = useCallback((tab: OpenNoteTab, nextTitle: string) => {
    const documentResult = getTabDocument(tab);
    if (!documentResult) {
      return;
    }

    const currentDraft = getTabDraft(tab);
    updateDraft(tab.tabId, {
      title: nextTitle,
      content: currentDraft?.content ?? documentResult.content,
      baseTitle: currentDraft?.baseTitle ?? documentResult.title,
      baseContent: currentDraft?.baseContent ?? documentResult.content,
    });
  }, [getTabDocument, getTabDraft, updateDraft]);

  const getTabRecovery = useCallback((tab: OpenNoteTab): DocumentPaneView['recovery'] => {
    const identity = getTabIdentity(tab);
    if (!noteIdentityMatches(saveFailedNote, identity)) {
      return null;
    }

    const message = saveError instanceof Error ? saveError.message : String(saveError ?? '');
    if (!message.toLowerCase().includes('file changed on disk')) {
      return null;
    }

    return {
      kind: 'disk_changed',
      message,
    };
  }, [getTabIdentity, saveError, saveFailedNote]);

  const handleDocumentContentChange = useCallback((tab: OpenNoteTab, nextContent: string) => {
    const documentResult = getTabDocument(tab);
    if (!documentResult) {
      return;
    }

    const currentDraft = getTabDraft(tab);
    updateDraft(tab.tabId, {
      title: currentDraft?.title ?? documentResult.title,
      content: nextContent,
      baseTitle: currentDraft?.baseTitle ?? documentResult.title,
      baseContent: currentDraft?.baseContent ?? documentResult.content,
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
    const identity = tab ? getTabIdentity(tab) : null;
    const isSavingTab = Boolean(identity && isSavingNote && noteIdentityMatches(savingNote, identity));
    const isUploadingTab = Boolean(identity && isUploadingImage && noteIdentityMatches(uploadingNote, identity));
    const isDeletingTab = Boolean(identity && isDeletingNote && noteIdentityMatches(deletingNote, identity));

    return {
      pane,
      activeTab: tab,
      selectedNote: tab ? { title: getTabTitle(tab) } : null,
      document: documentValue,
      title: tab ? getTabTitle(tab) : '',
      content: tab ? getTabContent(tab) : '',
      recovery: tab ? getTabRecovery(tab) : null,
      isLoading: syncState === 'loading' && !isShowingCachedFallback(documentResult),
      syncState,
      isSaving: isSavingTab,
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
    isSavingNote,
    isUploadingImage,
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
    getTabSyncState,
    getTabTitle,
    handleDocumentContentChange,
    handleDocumentTitleChange,
    isTabDirty,
    noteDirty,
    selectedDocument,
  };
}
