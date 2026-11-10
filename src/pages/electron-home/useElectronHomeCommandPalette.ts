import { useCallback, useEffect } from 'react';

import type { NoteSummary, TeamSummary } from '@/lib/electron-api';
import { recentNoteMatches, type ElectronRecentNote } from '@/lib/electron-recent-notes';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import type { OpenNoteTargetOptions } from './useNoteLinkOpener';
import type { RevealNoteOptions } from './useWorkbenchNavigator';
import type { CommandPaletteState, WorkspaceScope } from './types';
import { usePendingRecentNoteRestore } from './usePendingRecentNoteRestore';
import { useWorkbenchQuickOpen } from './useWorkbenchQuickOpen';

export type ElectronHomeCommandPaletteOptions = {
  localVaultId?: string | null;
  localVaults?: { id: string; path: string }[];
  onSwitchLocalVault?: (vaultId: string) => void;
  displayScope: WorkspaceScope;
  expandNavigator: () => void;
  focusNavigator: () => void;
  handleShowFinderResults: (query: string) => void;
  isWorkspaceFetching: boolean;
  isWorkspaceLoading: boolean;
  palette: CommandPaletteState;
  recentNotes: ElectronRecentNote[];
  removeRecentNoteEntry: (noteId: string, teamPath: string | null) => void;
  requestSelectNote: (note: NoteSummary, options?: { focusEditor?: boolean; trackRecent?: boolean; inPlace?: boolean }) => Promise<boolean>;
  revealFolderIds: (folderIds: string[]) => void;
  revealNoteEntry: (entry: FolderTreeNote, options?: RevealNoteOptions) => Promise<boolean>;
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
  localVaultId,
  localVaults,
  onSwitchLocalVault,
  displayScope,
  expandNavigator,
  focusNavigator,
  handleShowFinderResults,
  isWorkspaceFetching,
  isWorkspaceLoading,
  palette,
  recentNotes,
  removeRecentNoteEntry,
  requestSelectNote,
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
    isWorkspaceFetching,
    isWorkspaceLoading,
    removeRecentNoteEntry,
    revealNoteEntry,
    scope,
    tree,
  });

  useEffect(() => { clearPendingRecentNote(); }, [localVaultId, clearPendingRecentNote]);

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
    localVaultId,
    onSwitchLocalVault,
    expandNavigator,
    focusNavigator,
    isWorkspaceFetching,
    isWorkspaceLoading,
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

  /**
   * Opens the note a link points to. A linked HackMD note may be in no workspace list, such as
   * someone else's note, so one that is not loaded opens directly; HackDesk reads it by ID.
   * Following a link (or a book's chapter) keeps the sidebar as it is: a hidden one stays hidden.
   */
  const openNoteTarget = useCallback((entry: ElectronRecentNote, options: OpenNoteTargetOptions = {}) => {
    if (entry.teamPath === LOCAL_VAULT_TEAM_PATH || tree.allNotes.some(candidate => recentNoteMatches(candidate.note, entry))) {
      handleQuickOpenRecentNote(entry, { expandNavigator: false, inPlace: options.inPlace });
      return;
    }
    void requestSelectNote(linkedNoteSummary(entry), { focusEditor: true, trackRecent: true, inPlace: options.inPlace });
  }, [handleQuickOpenRecentNote, requestSelectNote, tree.allNotes]);

  return {
    commandPaletteProps: {
      localVaults,
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
    openNoteTarget,
    switchWorkspaceScope,
  };
}

/** Enough of a note to open its tab; the full note arrives when it is read. */
function linkedNoteSummary(entry: ElectronRecentNote): NoteSummary {
  return {
    id: entry.noteId,
    title: entry.title,
    description: '',
    tags: [],
    updatedAtMillis: null,
    createdAtMillis: null,
    publishedAtMillis: null,
    tagsUpdatedAtMillis: null,
    titleUpdatedAtMillis: null,
    content: null,
    publishLink: '',
    shortId: entry.shortId,
    permalink: null,
    teamPath: entry.teamPath,
    userPath: null,
    publishType: 'edit',
    readPermission: 'owner',
    writePermission: 'owner',
    lastChangeUser: null,
    folderPaths: [],
  };
}
