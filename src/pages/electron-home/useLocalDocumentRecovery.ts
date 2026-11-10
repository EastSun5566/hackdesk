import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';

import type { DocumentSummary, HackDeskElectronAPI, NoteSummary, UpdateNoteInput } from '@/lib/electron-api';
import type { LocalDocument, LocalRevision, LocalVaultSnapshot } from '@/lib/local-vault';

import {
  getLocalParentPathFromRelativePath,
  getLocalRevision,
  LOCAL_VAULT_TEAM_PATH,
  localRevisionsEqual,
  toDocumentSummary,
  type LocalDocumentSummary,
  type LocalNoteListSummary,
} from './local-vault-adapter';
import { isBlankNoteTab, isDraftNoteTab, type NoteDocumentDraft, type NoteIdentity, type OpenNoteTab } from './note-workspace';
import {
  getLocalVaultDocumentQueryKey,
  cacheLocalVaultSnapshot,
} from './useElectronLocalVault';

type LocalDocumentQueries = {
  refetchByIdentity: (note: NoteIdentity) => Promise<unknown>;
};

function getRefetchedLocalDocument(result: unknown): LocalDocument | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  if ('revision' in result && 'content' in result) {
    return result as LocalDocument;
  }

  const data = (result as { data?: unknown }).data;
  if (data && typeof data === 'object' && 'revision' in data && 'content' in data) {
    return data as LocalDocument;
  }

  return null;
}

export function useLocalDocumentRecovery({
  api,
  clearDraft,
  documentQueries,
  drafts,
  enabled,
  getTabsMatching,
  notes,
  openNote,
  resetSaveMutation,
  snapshotForNote,
  syncNoteSummary,
  tabs,
  trackRecentNote,
}: {
  api?: HackDeskElectronAPI;
  clearDraft: (tabId: string) => void;
  documentQueries: LocalDocumentQueries;
  drafts: Record<string, NoteDocumentDraft>;
  enabled: boolean;
  getTabsMatching: (note: NoteIdentity) => OpenNoteTab[];
  /** Every note a tab may hold: in a named set, the notes of all its folders. */
  notes: NoteSummary[];
  /** The scan of the folder holding a note, when it is not the open folder. */
  snapshotForNote?: (note: NoteIdentity) => LocalVaultSnapshot | null;
  openNote: (note: NoteSummary) => void;
  resetSaveMutation: () => void;
  syncNoteSummary: (note: NoteSummary) => void;
  tabs: Record<string, OpenNoteTab>;
  trackRecentNote: (note: NoteSummary) => void;
}) {
  const queryClient = useQueryClient();
  const latestLocalRevisionByNoteId = useMemo(() => {
    const revisions = new Map<string, LocalRevision>();
    for (const note of notes as LocalNoteListSummary[]) {
      const revision = getLocalRevision(note);
      if (note.teamPath === LOCAL_VAULT_TEAM_PATH && revision) {
        revisions.set(note.id, revision);
      }
    }
    return revisions;
  }, [notes]);
  const reloadingCleanTabsRef = useRef(new Set<string>());

  const refetchLocalDocument = useCallback(async (note: NoteIdentity) => {
    const result = await documentQueries.refetchByIdentity(note);
    const document = getRefetchedLocalDocument(result);
    if (document) {
      // A note from another folder of the set is described by that folder, not the open one.
      const active = await api?.localVault.getSnapshot();
      const owner = snapshotForNote?.(note);
      const snapshot = owner && owner.vaultId !== active?.vaultId
        && owner.notes.some((candidate) => candidate.id === document.id)
        ? owner
        : active;
      if (snapshot) {
        const summary = toDocumentSummary(document, snapshot);
        syncNoteSummary(summary);
        cacheLocalVaultSnapshot(queryClient, snapshot);
        queryClient.setQueryData(getLocalVaultDocumentQueryKey(document.id, snapshot.vaultId), document);
      }
    }
    return document;
  }, [api, documentQueries, queryClient, snapshotForNote, syncNoteSummary]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    for (const tab of Object.values(tabs)) {
      if (isDraftNoteTab(tab) || isBlankNoteTab(tab)) {
        continue;
      }

      if (tab.teamPath !== LOCAL_VAULT_TEAM_PATH || drafts[tab.tabId]) {
        continue;
      }

      const latestRevision = latestLocalRevisionByNoteId.get(tab.noteId);
      if (!latestRevision || localRevisionsEqual(tab.localRevision, latestRevision) || reloadingCleanTabsRef.current.has(tab.tabId)) {
        continue;
      }

      reloadingCleanTabsRef.current.add(tab.tabId);
      void refetchLocalDocument({ id: tab.noteId, teamPath: tab.teamPath })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to reload note from disk.');
        })
        .finally(() => {
          reloadingCleanTabsRef.current.delete(tab.tabId);
        });
    }
  }, [drafts, enabled, latestLocalRevisionByNoteId, refetchLocalDocument, tabs]);

  const reloadFromDisk = useCallback((document: DocumentSummary) => {
    const identity = { id: document.id, teamPath: document.teamPath ?? null };
    void refetchLocalDocument(identity)
      .then(() => {
        for (const tab of getTabsMatching(identity)) {
          clearDraft(tab.tabId);
        }
        resetSaveMutation();
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to reload note from disk.');
      });
  }, [clearDraft, getTabsMatching, refetchLocalDocument, resetSaveMutation]);

  const saveAsCopy = useCallback((document: DocumentSummary, input: UpdateNoteInput) => {
    if (!api) {
      toast.error('Electron API is unavailable.');
      return;
    }

    if (document.teamPath !== LOCAL_VAULT_TEAM_PATH) {
      toast.error('Save as copy is only available for local vault notes.');
      return;
    }

    void (async () => {
      const relativePath = (document as Partial<LocalDocumentSummary>).localRelativePath ?? document.description;
      const { document: createdDocument, snapshot } = await api.localVault.createNote({
        title: `${(input.title ?? document.title).trim() || 'Untitled'} copy`,
        content: input.content ?? document.content ?? '',
        parentPath: getLocalParentPathFromRelativePath(relativePath),
      });

      cacheLocalVaultSnapshot(queryClient, snapshot);
      queryClient.setQueryData(getLocalVaultDocumentQueryKey(createdDocument.id, snapshot.vaultId), createdDocument);
      const createdSummary = toDocumentSummary(createdDocument, snapshot);
      openNote(createdSummary);
      trackRecentNote(createdSummary);
      resetSaveMutation();
      toast.success('Saved as a local copy.');
    })().catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save note as copy.');
    });
  }, [api, openNote, queryClient, resetSaveMutation, trackRecentNote]);

  return {
    latestLocalRevisionByNoteId,
    reloadFromDisk,
    saveAsCopy,
  };
}
