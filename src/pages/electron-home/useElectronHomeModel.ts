import { useEffect, useMemo } from 'react';

import type { FolderOrder, FolderSummary, NoteSummary, TeamSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import type { WorkspaceScope } from './types';
import { localVaultFolderName } from './workspace-root-labels';

export type ElectronHomeModelOptions = {
  currentFolderOrder?: FolderOrder;
  currentFolders: FolderSummary[];
  currentNotes: NoteSummary[];
  scope: WorkspaceScope;
  localVaultPath?: string | null;
  selectedFolderId: string | null;
  syncOpenNoteSummaries: (notes: NoteSummary[]) => void;
  teams: TeamSummary[];
};

export function useElectronHomeModel({
  currentFolderOrder,
  currentFolders,
  currentNotes,
  scope,
  localVaultPath,
  selectedFolderId,
  syncOpenNoteSummaries,
  teams,
}: ElectronHomeModelOptions) {
  const displayScope = useMemo<WorkspaceScope>(() => {
    if (scope.type === 'local' && localVaultPath) {
      const folderName = localVaultFolderName(localVaultPath);
      return folderName !== scope.label
        ? { type: 'local', label: folderName, vaultId: scope.vaultId }
        : scope;
    }

    if (scope.type !== 'team') {
      return scope;
    }

    const team = teams.find((candidate) => candidate.path === scope.teamPath);
    return team && team.name !== scope.label
      ? { type: 'team', label: team.name, teamPath: team.path }
      : scope;
  }, [scope, teams, localVaultPath]);

  const folderTree = useMemo(
    () => buildHackmdFolderTree(currentNotes, currentFolders, currentFolderOrder),
    [currentFolderOrder, currentFolders, currentNotes],
  );

  useEffect(() => {
    syncOpenNoteSummaries(currentNotes);
  }, [currentNotes, syncOpenNoteSummaries]);

  const selectedParentFolderIdForMutation = selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID
    ? selectedFolderId
    : undefined;

  return {
    displayScope,
    folderTree,
    selectedParentFolderIdForMutation,
  };
}
