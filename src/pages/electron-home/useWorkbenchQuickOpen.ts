import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

import type { QuickOpenFolderResult, QuickOpenWorkspaceResult } from '@/lib/electron-quick-open';
import { recentNoteMatches, type ElectronRecentNote } from '@/lib/electron-recent-notes';
import type { TeamSummary } from '@/lib/electron-api';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';

import type { WorkspaceScope } from './types';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { recentNoteTargetsScope } from './usePendingRecentNoteRestore';

export type WorkbenchQuickOpenOptions = {
  localVaultId?: string | null;
  expandNavigator: () => void;
  focusNavigator: () => void;
  isWorkspaceFetching: boolean;
  isWorkspaceLoading: boolean;
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
  localVaultId,
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
}: WorkbenchQuickOpenOptions) {
  const handleQuickOpenNote = useCallback((entry: FolderTreeNote) => {
    void revealNoteEntry(entry);
  }, [revealNoteEntry]);

  const handleQuickOpenRecentNote = useCallback((entry: ElectronRecentNote) => {
    if (entry.teamPath === LOCAL_VAULT_TEAM_PATH && (!localVaultId || entry.vaultId !== localVaultId)) return;
    const loadedEntry = tree.allNotes.find((candidate) => (
      recentNoteMatches(candidate.note, entry)
    ));

    if (loadedEntry) {
      clearPendingRecentNote();
      void revealNoteEntry(loadedEntry);
      return;
    }

    if (recentNoteTargetsScope(entry, scope) && !isWorkspaceLoading && !isWorkspaceFetching) {
      removeRecentNoteEntry(entry.noteId, entry.teamPath);
      toast.info(`“${entry.title || 'Untitled'}” is no longer available in this workspace.`);
      return;
    }

    if (entry.teamPath === LOCAL_VAULT_TEAM_PATH) {
      queuePendingRecentNote(entry);
      setWorkspaceScope({ type: 'local', label: 'Local Vault' });
      toast.info(`Loading Local Vault before opening “${entry.title || 'Untitled'}”.`);
      focusNavigator();
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
    localVaultId,
    focusNavigator,
    isWorkspaceFetching,
    isWorkspaceLoading,
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
