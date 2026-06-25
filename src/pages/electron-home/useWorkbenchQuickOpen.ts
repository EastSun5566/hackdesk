import { useCallback } from 'react';
import { toast } from 'sonner';

import type { QuickOpenFolderResult, QuickOpenWorkspaceResult } from '@/lib/electron-quick-open';
import { recentNoteMatches, type ElectronRecentNote } from '@/lib/electron-recent-notes';
import type { TeamSummary } from '@/lib/electron-api';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';

import type { WorkspaceScope } from './types';

export type WorkbenchQuickOpenOptions = {
  expandNavigator: () => void;
  focusNavigator: () => void;
  isNotesFetching: boolean;
  isNotesLoading: boolean;
  clearPendingRecentNote: () => void;
  queuePendingRecentNote: (note: ElectronRecentNote) => void;
  removeRecentNoteEntry: (noteId: string, teamPath: string | null) => void;
  revealFolderIds: (folderIds: string[]) => void;
  revealNoteEntry: (entry: FolderTreeNote) => Promise<boolean>;
  scope: WorkspaceScope;
  setSelectedFolderId: (folderId: string | null) => void;
  setWorkspaceScope: (scope: WorkspaceScope) => void;
  teams: TeamSummary[];
  tree: FolderTree;
};

export function useWorkbenchQuickOpen({
  expandNavigator,
  focusNavigator,
  isNotesFetching,
  isNotesLoading,
  clearPendingRecentNote,
  queuePendingRecentNote,
  removeRecentNoteEntry,
  revealFolderIds,
  revealNoteEntry,
  scope,
  setSelectedFolderId,
  setWorkspaceScope,
  teams,
  tree,
}: WorkbenchQuickOpenOptions) {
  const handleQuickOpenNote = useCallback((entry: FolderTreeNote) => {
    void revealNoteEntry(entry);
  }, [revealNoteEntry]);

  const handleQuickOpenRecentNote = useCallback((entry: ElectronRecentNote) => {
    const loadedEntry = tree.allNotes.find((candidate) => (
      recentNoteMatches(candidate.note, entry)
    ));

    if (loadedEntry) {
      clearPendingRecentNote();
      void revealNoteEntry(loadedEntry);
      return;
    }

    const currentTeamPath = scope.type === 'team' ? scope.teamPath : null;
    const isCurrentWritableScope = scope.type !== 'history' && currentTeamPath === entry.teamPath;
    if (isCurrentWritableScope && !isNotesLoading && !isNotesFetching) {
      removeRecentNoteEntry(entry.noteId, entry.teamPath);
      toast.info(`“${entry.title || 'Untitled'}” is no longer available in this workspace.`);
      return;
    }

    if (entry.teamPath) {
      const team = teams.find((candidate) => candidate.path === entry.teamPath);
      queuePendingRecentNote(entry);
      setWorkspaceScope({
        type: 'team',
        label: team?.name ?? entry.teamPath,
        teamPath: entry.teamPath,
      });
      toast.info(`Loading ${team?.name ?? entry.teamPath} before opening “${entry.title || 'Untitled'}”.`);
      focusNavigator();
      return;
    }

    queuePendingRecentNote(entry);
    setWorkspaceScope({ type: 'personal', label: 'My Workspace' });
    toast.info(`Loading My Workspace before opening “${entry.title || 'Untitled'}”.`);
    focusNavigator();
  }, [
    clearPendingRecentNote,
    focusNavigator,
    isNotesFetching,
    isNotesLoading,
    queuePendingRecentNote,
    removeRecentNoteEntry,
    revealNoteEntry,
    scope,
    setWorkspaceScope,
    teams,
    tree.allNotes,
  ]);

  const handleQuickOpenWorkspace = useCallback((workspace: QuickOpenWorkspaceResult) => {
    clearPendingRecentNote();
    if (workspace.type === 'personal') {
      setWorkspaceScope({ type: 'personal', label: workspace.label });
    } else if (workspace.type === 'history') {
      setWorkspaceScope({ type: 'history', label: workspace.label });
    } else {
      setWorkspaceScope({ type: 'team', label: workspace.label, teamPath: workspace.teamPath });
    }

    focusNavigator();
  }, [clearPendingRecentNote, focusNavigator, setWorkspaceScope]);

  const handleQuickOpenFolder = useCallback((folder: QuickOpenFolderResult) => {
    expandNavigator();
    revealFolderIds([...folder.ancestorIds, folder.id]);
    setSelectedFolderId(folder.id);
    focusNavigator();
  }, [expandNavigator, focusNavigator, revealFolderIds, setSelectedFolderId]);

  return {
    handleQuickOpenFolder,
    handleQuickOpenNote,
    handleQuickOpenRecentNote,
    handleQuickOpenWorkspace,
  };
}
