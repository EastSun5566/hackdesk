import { useMemo } from 'react';

import type { FolderTreeNode } from '@/lib/hackmd-folders';

import {
  getRepositoryError,
  isShowingCachedFallback,
} from './repository';
import type { WorkspaceScope } from './types';
import type { useElectronHackmdQueries } from './useElectronHackmdQueries';
import type { useElectronNoteMutations } from './useElectronNoteMutations';

export type ElectronHomeStatusOptions = {
  canCreate: boolean;
  finderActive: boolean;
  hasLocalVault: boolean;
  hasToken: boolean;
  localVaultError?: string | null;
  mutations: ReturnType<typeof useElectronNoteMutations>;
  queries: ReturnType<typeof useElectronHackmdQueries>['queries'];
  scope: WorkspaceScope;
  selectedFolder: FolderTreeNode | null;
};

export function useElectronHomeStatus({
  canCreate,
  finderActive,
  hasLocalVault,
  hasToken,
  localVaultError,
  mutations,
  queries,
  scope,
  selectedFolder,
}: ElectronHomeStatusOptions) {
  return useMemo(() => {
    const notesError = getRepositoryError(queries.notesQuery.data);
    const foldersError = getRepositoryError(queries.foldersQuery.data);
    const folderOrderError = getRepositoryError(queries.folderOrderQuery.data);
    const userError = getRepositoryError(queries.userQuery.data);
    const teamsError = getRepositoryError(queries.teamsQuery.data);
    const activeError = scope.type === 'local'
      ? localVaultError ?? null
      : notesError ?? foldersError ?? folderOrderError;
    const showingCachedFallback =
      isShowingCachedFallback(queries.notesQuery.data)
      || isShowingCachedFallback(queries.foldersQuery.data)
      || isShowingCachedFallback(queries.folderOrderQuery.data);
    const accountError = userError ?? teamsError;
    const accountShowingCachedFallback =
      isShowingCachedFallback(queries.userQuery.data)
      || isShowingCachedFallback(queries.teamsQuery.data);
    const emptyTitle = scope.type === 'local' && !hasLocalVault
      ? 'Open a local folder'
      : !hasToken
      ? 'Connect HackMD'
      : finderActive
        ? 'No matching notes'
        : scope.type === 'history'
          ? 'No history yet'
          : selectedFolder
            ? 'No notes in this folder'
            : 'No notes in this workspace';
    const emptyDescription = scope.type === 'local' && !hasLocalVault
      ? 'Choose a folder to store plain Markdown notes on this device.'
      : !hasToken
      ? 'Add an API token to load your notes and teams.'
      : finderActive
        ? 'Try a different search, sort, or filter.'
        : scope.type === 'history'
          ? 'Your HackMD history appears after your first successful sync.'
          : selectedFolder
            ? 'Create a note here or choose another folder.'
            : 'Create a note or refresh after another client changes HackMD.';

    return {
      emptyState: {
        title: emptyTitle,
        description: emptyDescription,
      },
      navigatorStatus: {
        activeError,
        canCreate,
        hasLocalVault,
        hasToken: scope.type === 'local' ? true : hasToken,
        isCreating: mutations.createNoteMutation.isPending || mutations.createFolderMutation.isPending,
        isFetching: queries.notesQuery.isFetching || queries.foldersQuery.isFetching || queries.folderOrderQuery.isFetching,
        isLoading: queries.notesQuery.isLoading || queries.foldersQuery.isLoading || queries.folderOrderQuery.isLoading,
        isMovingFolder: mutations.moveFolderMutation.isPending,
        isMovingNote: mutations.moveNoteMutation.isPending,
        showingCachedFallback,
      },
      accountStatus: {
        activeError: accountError,
        isFetching: queries.userQuery.isFetching || queries.teamsQuery.isFetching,
        isLoading: queries.userQuery.isLoading || queries.teamsQuery.isLoading,
        showingCachedFallback: accountShowingCachedFallback,
      },
    };
  }, [
    canCreate,
    finderActive,
    hasLocalVault,
    hasToken,
    localVaultError,
    mutations.createFolderMutation.isPending,
    mutations.createNoteMutation.isPending,
    mutations.moveFolderMutation.isPending,
    mutations.moveNoteMutation.isPending,
    queries.folderOrderQuery.data,
    queries.folderOrderQuery.isFetching,
    queries.folderOrderQuery.isLoading,
    queries.foldersQuery.data,
    queries.foldersQuery.isFetching,
    queries.foldersQuery.isLoading,
    queries.notesQuery.data,
    queries.notesQuery.isFetching,
    queries.notesQuery.isLoading,
    queries.teamsQuery.data,
    queries.teamsQuery.isFetching,
    queries.teamsQuery.isLoading,
    queries.userQuery.data,
    queries.userQuery.isFetching,
    queries.userQuery.isLoading,
    scope.type,
    selectedFolder,
  ]);
}
