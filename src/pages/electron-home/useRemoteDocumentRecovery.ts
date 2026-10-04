import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';

import type { DocumentSummary, RepositoryValue } from '@/lib/electron-api';

import type { NoteIdentity, OpenNoteTab } from './note-workspace';

type RemoteDocumentQueries = {
  refetchByIdentity: (note: NoteIdentity) => Promise<unknown>;
};

/** Reads a refetch result, which is either a query observer result or the IPC value itself. */
function getRefetchedRemoteDocument(result: unknown): { value?: RepositoryValue<DocumentSummary>; fromQuery: boolean } {
  if (!result || typeof result !== 'object') return { fromQuery: false };
  if ('source' in result) return { value: result as RepositoryValue<DocumentSummary>, fromQuery: false };
  const observer = result as { data?: RepositoryValue<DocumentSummary>; error?: unknown };
  // A failed refetch keeps the previous data, which must not count as fresh.
  if (observer.error) throw observer.error;
  return { value: observer.data, fromQuery: true };
}

/**
 * Replaces drafts with the latest HackMD note, but only after HackMD itself
 * answered; a cached or failed read never discards a draft.
 */
export function useRemoteDocumentRecovery({
  clearDraft,
  documentQueries,
  getTabsMatching,
  resetSaveMutation,
}: {
  clearDraft: (tabId: string) => void;
  documentQueries: RemoteDocumentQueries;
  getTabsMatching: (note: NoteIdentity) => OpenNoteTab[];
  resetSaveMutation: () => void;
}) {
  const queryClient = useQueryClient();

  const reloadFromHackmd = useCallback((document: DocumentSummary) => {
    const identity = { id: document.id, teamPath: document.teamPath ?? null };
    void (async () => {
      const { value, fromQuery } = getRefetchedRemoteDocument(await documentQueries.refetchByIdentity(identity));
      if (value?.source !== 'remote') {
        const reason = value?.source === 'error' ? ` ${value.error}` : '';
        throw new Error(`Could not load the latest note from HackMD, so your draft was kept.${reason}`);
      }
      if (!fromQuery) {
        queryClient.setQueryData(['electron', 'hackmd', 'note', identity.teamPath, identity.id], value);
      }
      for (const tab of getTabsMatching(identity)) {
        clearDraft(tab.tabId);
      }
      resetSaveMutation();
    })().catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to reload note from HackMD.');
    });
  }, [clearDraft, documentQueries, getTabsMatching, queryClient, resetSaveMutation]);

  return { reloadFromHackmd };
}
