import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useShowHiddenFiles } from './hidden-files-preference';

import type { DocumentSummary, HackDeskElectronAPI, RepositoryValue } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { stripIpcErrorPrefix } from '@/lib/note-errors';
import { getLocalVaultDocumentQueryKey, invalidateMovedLocalVaultDocuments } from './local-vault-query';
export { getLocalVaultDocumentQueryKey, getLocalVaultSnapshotQueryKey, cacheLocalVaultSnapshot } from './local-vault-query';
import { getNoteIdentityKey, type NoteIdentity } from './note-workspace';
import { adaptLocalVaultSnapshot, localDocumentRepositoryValue, LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

/** Which folder's snapshot holds each note: the open folder first, then the rest of the set. */
export function buildLocalNoteOwners(
  snapshot: LocalVaultSnapshot | null,
  workspaceSnapshots: LocalVaultSnapshot[] | undefined,
) {
  const owners = new Map<string, LocalVaultSnapshot>();
  for (const candidate of [snapshot, ...(workspaceSnapshots ?? [])]) {
    if (!candidate) continue;
    for (const note of candidate.notes) {
      if (!owners.has(note.id)) owners.set(note.id, candidate);
    }
  }
  return owners;
}

export function isLocalNoteIdentity(note: NoteIdentity | null | undefined) {
  return note?.teamPath === LOCAL_VAULT_TEAM_PATH;
}

export function useElectronLocalVault({
  api,
  activeDocumentNotes,
  enabled,
  selectedNote,
  snapshot,
  workspaceSnapshots,
}: {
  api?: HackDeskElectronAPI;
  snapshot: LocalVaultSnapshot | null;
  /** Every folder of the open named set; a tab may hold a note from any of them. */
  workspaceSnapshots?: LocalVaultSnapshot[];
  activeDocumentNotes?: NoteIdentity[];
  enabled: boolean;
  selectedNote: NoteIdentity | null;
}) {
  const queryClient = useQueryClient();
  const showHidden = useShowHiddenFiles();
  const previousSnapshot = useRef<LocalVaultSnapshot | null>(null);
  useEffect(() => {
    const previous = previousSnapshot.current;
    previousSnapshot.current = snapshot;
    if (snapshot && enabled) void invalidateMovedLocalVaultDocuments(queryClient, snapshot, previous);
  }, [snapshot, enabled, queryClient]);
  // The other folders refresh on their own; a note that moved or left one is read again, as for
  // the open folder above.
  const previousWorkspaceSnapshots = useRef(new Map<string, LocalVaultSnapshot>());
  useEffect(() => {
    if (!enabled) return;
    const previous = previousWorkspaceSnapshots.current;
    const next = new Map<string, LocalVaultSnapshot>();
    for (const other of workspaceSnapshots ?? []) {
      next.set(other.vaultId, other);
      if (other.vaultId === snapshot?.vaultId) continue;
      const before = previous.get(other.vaultId);
      if (before && before !== other) void invalidateMovedLocalVaultDocuments(queryClient, other, before);
    }
    previousWorkspaceSnapshots.current = next;
  }, [workspaceSnapshots, snapshot?.vaultId, enabled, queryClient]);
  const snapshotByNoteId = useMemo(
    () => buildLocalNoteOwners(snapshot, workspaceSnapshots),
    [snapshot, workspaceSnapshots],
  );
  const ownerOf = useCallback(
    (note: NoteIdentity) => snapshotByNoteId.get(note.id) ?? snapshot,
    [snapshot, snapshotByNoteId],
  );
  const { folders, notes } = useMemo(() => adaptLocalVaultSnapshot(snapshot, showHidden), [snapshot, showHidden]);
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
      // Keyed by the folder that holds the note, so opening another folder of the set keeps it.
      queryKey: getLocalVaultDocumentQueryKey(note.id, ownerOf(note)?.vaultId),
      networkMode: 'always' as const,
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
    const entries = selectedDocumentNotes.map((note, index) => {
      const result = documentQueryResults[index];
      const value = localDocumentRepositoryValue(result?.data, ownerOf(note));
      // Report read failures like remote ones; earlier data stays only as a fallback.
      const repositoryValue: RepositoryValue<DocumentSummary> | undefined = result?.status === 'error'
        ? { source: 'error', error: stripIpcErrorPrefix(result.error instanceof Error ? result.error.message : String(result.error)), ...(value ? { data: value.data } : {}) }
        : value;
      return [getNoteIdentityKey(note), repositoryValue] as const;
    });
    return new Map(entries);
  }, [documentQueryResults, ownerOf, selectedDocumentNotes]);

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
    snapshotForNote: ownerOf,
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
