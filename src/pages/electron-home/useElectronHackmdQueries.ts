import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { HackDeskElectronAPI, NoteSummary } from '@/lib/electron-api';

import {
  EMPTY_FOLDER_ORDER,
  EMPTY_FOLDERS,
  EMPTY_NOTES,
  EMPTY_TEAMS,
  getFolderOrderQueryKey,
  getFoldersQueryKey,
  getWorkspaceQueryKey,
  isTokenConfigured,
  unwrapRepositoryValue,
} from './repository';
import type { WorkspaceScope } from './types';

export function useElectronHackmdQueries({
  api,
  scope,
  selectedNote,
}: {
  api?: HackDeskElectronAPI;
  scope: WorkspaceScope;
  selectedNote: NoteSummary | null;
}) {
  const {
    data: settings,
    isFetching: settingsIsFetching,
    isLoading: settingsIsLoading,
    refetch: refetchSettings,
  } = useQuery({
    queryKey: ['electron', 'settings'],
    queryFn: () => api?.settings.get(),
    enabled: !!api,
  });
  const hasToken = isTokenConfigured(settings);

  const {
    data: userData,
    isFetching: userIsFetching,
    isLoading: userIsLoading,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['electron', 'hackmd', 'current-user'],
    queryFn: () => api?.hackmd.getCurrentUser(),
    enabled: !!api && hasToken,
  });

  const {
    data: teamsData,
    isFetching: teamsIsFetching,
    isLoading: teamsIsLoading,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ['electron', 'hackmd', 'teams'],
    queryFn: () => api?.hackmd.listTeams(),
    enabled: !!api && hasToken,
  });

  const {
    data: notesData,
    isFetching: notesIsFetching,
    isLoading: notesIsLoading,
    refetch: refetchNotes,
  } = useQuery({
    queryKey: getWorkspaceQueryKey(scope),
    queryFn: () => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'team') {
        return api.hackmd.listTeamNotes(scope.teamPath);
      }

      return scope.type === 'history'
        ? api.hackmd.listHistory(40)
        : api.hackmd.listNotes();
    },
    enabled: !!api && hasToken,
  });

  const {
    data: foldersData,
    isFetching: foldersIsFetching,
    isLoading: foldersIsLoading,
    refetch: refetchFolders,
  } = useQuery({
    queryKey: getFoldersQueryKey(scope),
    queryFn: () => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'team') {
        return api.hackmd.listTeamFolders(scope.teamPath);
      }

      return api.hackmd.listFolders();
    },
    enabled: !!api && hasToken && scope.type !== 'history',
  });

  const {
    data: folderOrderData,
    isFetching: folderOrderIsFetching,
    isLoading: folderOrderIsLoading,
    refetch: refetchFolderOrder,
  } = useQuery({
    queryKey: getFolderOrderQueryKey(scope),
    queryFn: () => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'team') {
        return api.hackmd.getTeamFolderOrder(scope.teamPath);
      }

      return api.hackmd.getFolderOrder();
    },
    enabled: !!api && hasToken && scope.type !== 'history',
  });

  const {
    data: documentData,
    isFetching: documentIsFetching,
    isLoading: documentIsLoading,
    refetch: refetchDocument,
  } = useQuery({
    queryKey: ['electron', 'hackmd', 'note', selectedNote?.teamPath ?? null, selectedNote?.id],
    queryFn: () => {
      if (!api || !selectedNote) {
        throw new Error('No note selected.');
      }

      return api.hackmd.getNote(selectedNote.id, selectedNote.teamPath);
    },
    enabled: !!api && !!selectedNote,
  });

  const queries = useMemo(() => ({
    settingsQuery: {
      data: settings,
      isFetching: settingsIsFetching,
      isLoading: settingsIsLoading,
      refetch: refetchSettings,
    },
    userQuery: {
      data: userData,
      isFetching: userIsFetching,
      isLoading: userIsLoading,
      refetch: refetchUser,
    },
    teamsQuery: {
      data: teamsData,
      isFetching: teamsIsFetching,
      isLoading: teamsIsLoading,
      refetch: refetchTeams,
    },
    notesQuery: {
      data: notesData,
      isFetching: notesIsFetching,
      isLoading: notesIsLoading,
      refetch: refetchNotes,
    },
    foldersQuery: {
      data: foldersData,
      isFetching: foldersIsFetching,
      isLoading: foldersIsLoading,
      refetch: refetchFolders,
    },
    folderOrderQuery: {
      data: folderOrderData,
      isFetching: folderOrderIsFetching,
      isLoading: folderOrderIsLoading,
      refetch: refetchFolderOrder,
    },
    documentQuery: {
      data: documentData,
      isFetching: documentIsFetching,
      isLoading: documentIsLoading,
      refetch: refetchDocument,
    },
  }), [
    documentData,
    documentIsFetching,
    documentIsLoading,
    folderOrderData,
    folderOrderIsFetching,
    folderOrderIsLoading,
    foldersData,
    foldersIsFetching,
    foldersIsLoading,
    notesData,
    notesIsFetching,
    notesIsLoading,
    refetchDocument,
    refetchFolderOrder,
    refetchFolders,
    refetchNotes,
    refetchSettings,
    refetchTeams,
    refetchUser,
    settings,
    settingsIsFetching,
    settingsIsLoading,
    teamsData,
    teamsIsFetching,
    teamsIsLoading,
    userData,
    userIsFetching,
    userIsLoading,
  ]);

  return {
    settings,
    hasToken,
    user: unwrapRepositoryValue(userData),
    teams: unwrapRepositoryValue(teamsData) ?? EMPTY_TEAMS,
    currentNotes: unwrapRepositoryValue(notesData) ?? EMPTY_NOTES,
    currentFolders: unwrapRepositoryValue(foldersData) ?? EMPTY_FOLDERS,
    currentFolderOrder: unwrapRepositoryValue(folderOrderData) ?? EMPTY_FOLDER_ORDER,
    document: unwrapRepositoryValue(documentData),
    queries,
  };
}
