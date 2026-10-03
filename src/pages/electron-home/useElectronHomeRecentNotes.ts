import { useCallback, useEffect, useState } from 'react';

import { LOCAL_VAULT_TEAM_PATH, type LocalNoteListSummary } from './local-vault-adapter';
import type { NoteSummary } from '@/lib/electron-api';
import {
  readRecentNotes,
  removeRecentNote,
  upsertRecentNote,
  writeRecentNotes,
  type ElectronRecentNote,
} from '@/lib/electron-recent-notes';

export function useElectronHomeRecentNotes(storage: Storage = window.localStorage, vaultId: string | null = null) {
  const [recentNotes, setRecentNotes] = useState<ElectronRecentNote[]>(() => readRecentNotes(storage));

  useEffect(() => { setRecentNotes(readRecentNotes(storage)); }, [storage, vaultId]);

  const updateRecentNotes = useCallback((updater: (current: ElectronRecentNote[]) => ElectronRecentNote[]) => {
    setRecentNotes((current) => {
      const next = updater(current);
      if (next !== current) writeRecentNotes(storage, next);
      return next;
    });
  }, [storage]);

  const trackRecentNote = useCallback((note: NoteSummary) => {
    const noteVaultId = (note as Partial<LocalNoteListSummary>).localVaultId;
    if (note.teamPath === LOCAL_VAULT_TEAM_PATH && (!vaultId || (noteVaultId && noteVaultId !== vaultId))) return;
    updateRecentNotes((current) => upsertRecentNote(current, { ...note, localVaultId: note.teamPath === LOCAL_VAULT_TEAM_PATH ? vaultId ?? undefined : undefined }));
  }, [updateRecentNotes, vaultId]);

  const removeRecentNoteEntry = useCallback((noteId: string, teamPath: string | null) => {
    updateRecentNotes((current) => removeRecentNote(current, noteId, teamPath, vaultId ?? undefined));
  }, [updateRecentNotes, vaultId]);

  const syncLocalRecentNotes = useCallback((notes: NoteSummary[]) => {
    if (!vaultId) return;
    const byId = new Map(notes.filter((note) => note.teamPath === LOCAL_VAULT_TEAM_PATH
      && (note as Partial<LocalNoteListSummary>).localVaultId === vaultId).map((note) => [note.id, note]));
    updateRecentNotes((current) => {
      let changed = false;
      const next = current.map((recent) => {
        const note = recent.teamPath === LOCAL_VAULT_TEAM_PATH && recent.vaultId === vaultId ? byId.get(recent.noteId) : undefined;
        if (!note || (note.title === recent.title && note.shortId === recent.shortId)) return recent;
        changed = true;
        return { ...recent, title: note.title, shortId: note.shortId };
      });
      return changed ? next : current;
    });
  }, [updateRecentNotes, vaultId]);

  return {
    recentNotes: recentNotes.filter((note) => note.teamPath !== LOCAL_VAULT_TEAM_PATH || (!!vaultId && note.vaultId === vaultId)).slice(0, 12),
    removeRecentNoteEntry,
    trackRecentNote,
    syncLocalRecentNotes,
  };
}
