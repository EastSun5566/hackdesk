import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import {
  recentNoteMatches,
  type ElectronRecentNote,
} from '@/lib/electron-recent-notes';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';

import type { WorkspaceScope } from './types';

export type PendingRecentNoteRestoreOptions = {
  isNotesFetching: boolean;
  isNotesLoading: boolean;
  removeRecentNoteEntry: (noteId: string, teamPath: string | null) => void;
  revealNoteEntry: (entry: FolderTreeNote) => Promise<boolean>;
  scope: WorkspaceScope;
  tree: FolderTree;
};

export type PendingRecentNoteRestoreController = {
  clearPendingRecentNote: () => void;
  getPendingRecentNote: () => ElectronRecentNote | null;
  queuePendingRecentNote: (note: ElectronRecentNote) => void;
};

export function usePendingRecentNoteRestore({
  isNotesFetching,
  isNotesLoading,
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

    const currentTeamPath = scope.type === 'team' ? scope.teamPath : null;
    const isTargetScopeLoaded = scope.type !== 'history' && currentTeamPath === pendingRecentNote.teamPath;
    if (!isTargetScopeLoaded || isNotesLoading || isNotesFetching) {
      return;
    }

    const loadedEntry = tree.allNotes.find((candidate) => recentNoteMatches(candidate.note, pendingRecentNote));
    pendingRecentNoteRef.current = null;
    if (loadedEntry) {
      void revealNoteEntryRef.current(loadedEntry);
      return;
    }

    removeRecentNoteEntryRef.current(pendingRecentNote.noteId, pendingRecentNote.teamPath);
    toast.info(`“${pendingRecentNote.title || 'Untitled'}” is no longer available in this workspace.`);
  }, [isNotesFetching, isNotesLoading, scope, tree.allNotes]);

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
