import { useEffect, useMemo, useRef } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';

import type { HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { getLocalVaultDocumentQueryKey, invalidateMovedLocalVaultDocuments } from './local-vault-query';
export { getLocalVaultDocumentQueryKey, getLocalVaultSnapshotQueryKey, cacheLocalVaultSnapshot } from './local-vault-query';
import { getNoteIdentityKey, type NoteIdentity } from './note-workspace';
import { adaptLocalVaultSnapshot, localDocumentRepositoryValue, LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

export function isLocalNoteIdentity(note: NoteIdentity | null | undefined) {
  return note?.teamPath === LOCAL_VAULT_TEAM_PATH;
}

export function useElectronLocalVault({
  api,
  activeDocumentNotes,
  enabled,
  selectedNote,
  snapshot,
}: {
  api?: HackDeskElectronAPI;
  snapshot: LocalVaultSnapshot | null;
  activeDocumentNotes?: NoteIdentity[];
  enabled: boolean;
  selectedNote: NoteIdentity | null;
}) {
  const queryClient = useQueryClient();
  const previousSnapshot = useRef<LocalVaultSnapshot | null>(null);
  useEffect(() => {
    const previous = previousSnapshot.current;
    previousSnapshot.current = snapshot;
    if (snapshot && enabled) void invalidateMovedLocalVaultDocuments(queryClient, snapshot, previous);
  }, [snapshot, enabled, queryClient]);
  const { folders, notes } = useMemo(() => adaptLocalVaultSnapshot(snapshot), [snapshot]);
  const selectedDocumentNotes = useMemo(() => {
    const input = [...(activeDocumentNotes ?? [])];
    if (selectedNote && isLocalNoteIdentity(selectedNote)) {
      input.unshift(selectedNote);
    }

    const seen = new Set<string>();
    return input
      .filter(isLocalNoteIdentity)
      .filter((note) => {
        const key = getNoteIdentityKey(note);
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .slice(0, 2);
  }, [activeDocumentNotes, selectedNote]);

  const documentQueryResults = useQueries({
    queries: selectedDocumentNotes.map((note) => ({
      queryKey: getLocalVaultDocumentQueryKey(note.id, snapshot?.vaultId),
      queryFn: async ({ signal }) => {
        if (!api) {
          throw new Error('Electron API is unavailable.');
        }

        const document = await api.localVault.readNote(note.id);
        signal.throwIfAborted();
        return document;
      },
      enabled: !!api && enabled && !!snapshot,
    })),
  });

  const documentQueriesByKey = useMemo(() => {
    const entries = selectedDocumentNotes.map((note, index) => [
      getNoteIdentityKey(note),
      documentQueryResults[index],
    ] as const);
    return new Map(entries);
  }, [documentQueryResults, selectedDocumentNotes]);

  const documentsByKey = useMemo(() => {
    const entries = selectedDocumentNotes.map((note, index) => [
      getNoteIdentityKey(note),
      localDocumentRepositoryValue(documentQueryResults[index]?.data, snapshot),
    ] as const);
    return new Map(entries);
  }, [documentQueryResults, selectedDocumentNotes, snapshot]);

  const refetchByIdentity = (note: NoteIdentity) => {
    const query = documentQueriesByKey.get(getNoteIdentityKey(note));
    if (query) {
      return query.refetch();
    }

    if (!api) {
      return Promise.reject(new Error('Electron API is unavailable.'));
    }

    return api.localVault.readNote(note.id);
  };

  return {
    snapshot,
    currentFolders: folders,
    currentNotes: notes,
    documentsByKey,
    documentQueries: {
      byKey: documentQueriesByKey,
      documentsByKey,
      refetchByIdentity,
    },
  };
}
