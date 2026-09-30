import { useCallback, useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';

import {
  recentNoteMatches,
  type ElectronRecentNote,
} from '@/lib/electron-recent-notes';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';

import type { WorkspaceScope } from './types';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

export type PendingRecentNoteRestoreOptions = {
  isWorkspaceFetching: boolean;
  isWorkspaceLoading: boolean;
  removeRecentNoteEntry: (noteId: string, teamPath: string | null) => void;
  revealNoteEntry: (entry: FolderTreeNote) => Promise<boolean>;
  scope: WorkspaceScope;
  tree: FolderTree;
};

export function recentNoteTargetsScope(note: ElectronRecentNote, scope: WorkspaceScope) {
  if (note.teamPath === LOCAL_VAULT_TEAM_PATH) {
    return scope.type === 'local';
  }

  if (note.teamPath === null) {
    return scope.type === 'personal';
  }

  return scope.type === 'team' && scope.teamPath === note.teamPath;
}

export type PendingRecentNoteRestoreController = {
  clearPendingRecentNote: () => void;
  getPendingRecentNote: () => ElectronRecentNote | null;
  queuePendingRecentNote: (note: ElectronRecentNote) => void;
};

export function usePendingRecentNoteRestore({
  isWorkspaceFetching,
  isWorkspaceLoading,
  removeRecentNoteEntry,
  revealNoteEntry,
  scope,
  tree,
}: PendingRecentNoteRestoreOptions): PendingRecentNoteRestoreController {
  const pendingRecentNoteRef = useRef<ElectronRecentNote | null>(null);
  const removeRecentNoteEntryRef = useRef(removeRecentNoteEntry);
  const revealNoteEntryRef = useRef(revealNoteEntry);

  useEffect(() => {
    removeRecentNoteEntryRef.current = removeRecentNoteEntry;
    revealNoteEntryRef.current = revealNoteEntry;
  }, [removeRecentNoteEntry, revealNoteEntry]);

  const clearPendingRecentNote = useCallback(() => {
    pendingRecentNoteRef.current = null;
  }, []);

  const getPendingRecentNote = useCallback(() => (
    pendingRecentNoteRef.current
  ), []);

  const restorePendingRecentNote = useCallback(() => {
    const pendingRecentNote = pendingRecentNoteRef.current;
    if (!pendingRecentNote) {
      return;
    }

    if (!recentNoteTargetsScope(pendingRecentNote, scope)) {
      return;
    }

    const loadedEntry = tree.allNotes.find((candidate) => recentNoteMatches(candidate.note, pendingRecentNote));
    if (loadedEntry) {
      pendingRecentNoteRef.current = null;
      void revealNoteEntryRef.current(loadedEntry);
      return;
    }

    if (isWorkspaceLoading || isWorkspaceFetching) {
      return;
    }

    pendingRecentNoteRef.current = null;
    removeRecentNoteEntryRef.current(pendingRecentNote.noteId, pendingRecentNote.teamPath);
    toast.info(`“${pendingRecentNote.title || 'Untitled'}” is no longer available in this workspace.`);
  }, [isWorkspaceFetching, isWorkspaceLoading, scope, tree.allNotes]);

  useEffect(() => {
    restorePendingRecentNote();
  }, [restorePendingRecentNote]);

  const queuePendingRecentNote = useCallback((note: ElectronRecentNote) => {
    pendingRecentNoteRef.current = note;
    restorePendingRecentNote();
  }, [restorePendingRecentNote]);

  return {
    clearPendingRecentNote,
    getPendingRecentNote,
    queuePendingRecentNote,
  };
}
