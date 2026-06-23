import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
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
  pendingRecentNoteRef: MutableRefObject<ElectronRecentNote | null>;
  removeRecentNoteEntry: (noteId: string, teamPath: string | null) => void;
  revealNoteEntry: (entry: FolderTreeNote) => Promise<boolean>;
  scope: WorkspaceScope;
  tree: FolderTree;
};

export function usePendingRecentNoteRestore({
  isNotesFetching,
  isNotesLoading,
  pendingRecentNoteRef,
  removeRecentNoteEntry,
  revealNoteEntry,
  scope,
  tree,
}: PendingRecentNoteRestoreOptions) {
  useEffect(() => {
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
      void revealNoteEntry(loadedEntry);
      return;
    }

    removeRecentNoteEntry(pendingRecentNote.noteId, pendingRecentNote.teamPath);
    toast.info(`“${pendingRecentNote.title || 'Untitled'}” is no longer available in this workspace.`);
  }, [
    isNotesFetching,
    isNotesLoading,
    pendingRecentNoteRef,
    removeRecentNoteEntry,
    revealNoteEntry,
    scope,
    tree.allNotes,
  ]);
}
