import { useEffect, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import type { HackDeskElectronAPI } from '@/lib/electron-api';
import { getNoteIdentityKey, type NoteIdentity } from './note-workspace';
import { adaptLocalVaultSnapshot, localDocumentRepositoryValue, LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

export function getLocalVaultSnapshotQueryKey() {
  return ['electron', 'local-vault', 'snapshot'] as const;
}

export function getLocalVaultDocumentQueryKey(noteId: string) {
  return ['electron', 'local-vault', 'note', noteId] as const;
}

export function isLocalNoteIdentity(note: NoteIdentity | null | undefined) {
  return note?.teamPath === LOCAL_VAULT_TEAM_PATH;
}

export function useElectronLocalVault({
  api,
  activeDocumentNotes,
  enabled,
  selectedNote,
}: {
  api?: HackDeskElectronAPI;
  activeDocumentNotes?: NoteIdentity[];
  enabled: boolean;
  selectedNote: NoteIdentity | null;
}) {
  const queryClient = useQueryClient();
  const snapshotQuery = useQuery({
    queryKey: getLocalVaultSnapshotQueryKey(),
    queryFn: () => api?.localVault.getSnapshot() ?? Promise.resolve(null),
    enabled: !!api && enabled,
  });

  useEffect(() => {
    if (!api || !enabled) {
      return undefined;
    }

    return api.localVault.onDidChange((event) => {
      queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), event.snapshot);
    });
  }, [api, enabled, queryClient]);

  const snapshot = snapshotQuery.data ?? null;
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
      queryKey: getLocalVaultDocumentQueryKey(note.id),
      queryFn: () => {
        if (!api) {
          throw new Error('Electron API is unavailable.');
        }

        return api.localVault.readNote(note.id);
      },
      enabled: !!api && enabled,
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
    snapshotQuery,
  };
}
