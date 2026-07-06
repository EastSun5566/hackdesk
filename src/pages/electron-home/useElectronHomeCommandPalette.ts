import { useCallback } from 'react';

import type { TeamSummary } from '@/lib/electron-api';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';

import type { CommandPaletteState, WorkspaceScope } from './types';
import { usePendingRecentNoteRestore } from './usePendingRecentNoteRestore';
import { useWorkbenchQuickOpen } from './useWorkbenchQuickOpen';

export type ElectronHomeCommandPaletteOptions = {
  displayScope: WorkspaceScope;
  expandNavigator: () => void;
  focusNavigator: () => void;
  handleShowFinderResults: (query: string) => void;
  isNotesFetching: boolean;
  isNotesLoading: boolean;
  palette: CommandPaletteState;
  recentNotes: ElectronRecentNote[];
  removeRecentNoteEntry: (noteId: string, teamPath: string | null) => void;
  revealFolderIds: (folderIds: string[]) => void;
  revealNoteEntry: (entry: FolderTreeNote) => Promise<boolean>;
  scope: WorkspaceScope;
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  setPalette: (state: CommandPaletteState) => void;
  setSelectedFolderId: (folderId: string | null) => void;
  setWorkspaceScope: (scope: WorkspaceScope) => void;
  teams: TeamSummary[];
  tree: FolderTree;
};

export function useElectronHomeCommandPalette({
  displayScope,
  expandNavigator,
  focusNavigator,
  handleShowFinderResults,
  isNotesFetching,
  isNotesLoading,
  palette,
  recentNotes,
  removeRecentNoteEntry,
  revealFolderIds,
  revealNoteEntry,
  scope,
  selectedFolderId,
  selectedNoteId,
  setPalette,
  setSelectedFolderId,
  setWorkspaceScope,
  teams,
  tree,
}: ElectronHomeCommandPaletteOptions) {
  const openPalette = useCallback(() => {
    setPalette({ mode: 'commands', open: true, search: '' });
  }, [setPalette]);

  const openQuickOpen = useCallback(() => {
    setPalette({ mode: 'quick-open', open: true, search: '' });
  }, [setPalette]);

  const {
    clearPendingRecentNote,
    queuePendingRecentNote,
  } = usePendingRecentNoteRestore({
    isNotesFetching,
    isNotesLoading,
    removeRecentNoteEntry,
    revealNoteEntry,
    scope,
    tree,
  });

  const switchWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    clearPendingRecentNote();
    setWorkspaceScope(nextScope);
  }, [clearPendingRecentNote, setWorkspaceScope]);

  const {
    handleQuickOpenFolder,
    handleQuickOpenNote,
    handleQuickOpenRecentNote,
    handleQuickOpenWorkspace,
  } = useWorkbenchQuickOpen({
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
  });

  return {
    commandPaletteProps: {
      folderTree: tree,
      onSelectFolder: handleQuickOpenFolder,
      onSelectNote: handleQuickOpenNote,
      onSelectRecentNote: handleQuickOpenRecentNote,
      onSelectWorkspace: handleQuickOpenWorkspace,
      onShowFinderResults: handleShowFinderResults,
      onStateChange: setPalette,
      recentNotes,
      scope: displayScope,
      selectedFolderId,
      selectedNoteId,
      state: palette,
      teams,
    },
    openPalette,
    openQuickOpen,
    switchWorkspaceScope,
  };
}
