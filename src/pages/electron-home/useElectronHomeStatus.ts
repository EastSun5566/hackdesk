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
  hasToken: boolean;
  mutations: ReturnType<typeof useElectronNoteMutations>;
  queries: ReturnType<typeof useElectronHackmdQueries>['queries'];
  scope: WorkspaceScope;
  selectedFolder: FolderTreeNode | null;
};

export function useElectronHomeStatus({
  canCreate,
  finderActive,
  hasToken,
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
    const activeError = notesError ?? foldersError ?? folderOrderError ?? userError ?? teamsError;
    const showingCachedFallback =
      isShowingCachedFallback(queries.notesQuery.data)
      || isShowingCachedFallback(queries.foldersQuery.data)
      || isShowingCachedFallback(queries.folderOrderQuery.data)
      || isShowingCachedFallback(queries.userQuery.data)
      || isShowingCachedFallback(queries.teamsQuery.data);
    const emptyTitle = !hasToken
      ? 'Connect HackMD first'
      : finderActive
        ? 'No matching notes'
        : scope.type === 'history'
          ? 'No history yet'
          : selectedFolder
            ? 'No notes in this folder'
            : 'No notes in this workspace';
    const emptyDescription = !hasToken
      ? 'Add an API token in Settings to load your profile, teams, notes, and history.'
      : finderActive
        ? 'Try a different title, tag, folder path, short ID, team path, sort, or filter.'
        : scope.type === 'history'
          ? 'Your HackMD history will appear here after the first successful sync.'
          : 'Select another folder, create a note here, or refresh after another client changes HackMD.';

    return {
      emptyState: {
        title: emptyTitle,
        description: emptyDescription,
      },
      navigatorStatus: {
        activeError,
        canCreate,
        hasToken,
        isCreating: mutations.createNoteMutation.isPending || mutations.createFolderMutation.isPending,
        isFetching: queries.notesQuery.isFetching || queries.foldersQuery.isFetching || queries.folderOrderQuery.isFetching,
        isLoading: queries.notesQuery.isLoading || queries.foldersQuery.isLoading || queries.folderOrderQuery.isLoading,
        isMovingFolder: mutations.moveFolderMutation.isPending,
        isMovingNote: mutations.moveNoteMutation.isPending,
        showingCachedFallback,
      },
    };
  }, [
    canCreate,
    finderActive,
    hasToken,
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
    queries.userQuery.data,
    scope.type,
    selectedFolder,
  ]);
}
