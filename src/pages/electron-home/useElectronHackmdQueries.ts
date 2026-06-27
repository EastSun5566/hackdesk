import { useCallback, useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import type { HackDeskElectronAPI } from '@/lib/electron-api';

import { getNoteIdentityKey, type NoteIdentity } from './note-workspace';
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
  activeDocumentNotes,
}: {
  api?: HackDeskElectronAPI;
  scope: WorkspaceScope;
  selectedNote: NoteIdentity | null;
  activeDocumentNotes?: NoteIdentity[];
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
  const remoteScope = scope.type !== 'local';

  const {
    data: userData,
    isFetching: userIsFetching,
    isLoading: userIsLoading,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['electron', 'hackmd', 'current-user'],
    queryFn: () => api?.hackmd.getCurrentUser(),
    enabled: !!api && hasToken && remoteScope,
  });
  const {
    data: teamsData,
    isFetching: teamsIsFetching,
    isLoading: teamsIsLoading,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ['electron', 'hackmd', 'teams'],
    queryFn: () => api?.hackmd.listTeams(),
    enabled: !!api && hasToken && remoteScope,
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
    enabled: !!api && hasToken && remoteScope,
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
    enabled: !!api && hasToken && remoteScope && scope.type !== 'history',
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
    enabled: !!api && hasToken && remoteScope && scope.type !== 'history',
  });

  const selectedDocumentNotes = useMemo(() => {
    if (!remoteScope) {
      return [];
    }

    const notes = [...(activeDocumentNotes ?? [])];
    if (selectedNote && !notes.some((note) => getNoteIdentityKey(note) === getNoteIdentityKey(selectedNote))) {
      notes.unshift(selectedNote);
    }

    const seen = new Set<string>();
    return notes.filter((note) => {
      const key = getNoteIdentityKey(note);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }).slice(0, 2);
  }, [activeDocumentNotes, remoteScope, selectedNote]);

  const documentQueryResults = useQueries({
    queries: selectedDocumentNotes.map((note) => ({
      queryKey: ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id],
      queryFn: () => {
        if (!api) {
          throw new Error('Electron API is unavailable.');
        }

        return api.hackmd.getNote(note.id, note.teamPath);
      },
      enabled: !!api && !!note,
    })),
  });

  const documentQueriesByKey = useMemo(() => {
    const entries = selectedDocumentNotes.map((note, index) => [
      getNoteIdentityKey(note),
      documentQueryResults[index],
    ] as const);
    return new Map(entries);
  }, [documentQueryResults, selectedDocumentNotes]);

  const selectedDocumentQuery = selectedNote
    ? documentQueriesByKey.get(getNoteIdentityKey(selectedNote))
    : undefined;
  const documentData = selectedDocumentQuery?.data;
  const documentIsFetching = selectedDocumentQuery?.isFetching ?? false;
  const documentIsLoading = selectedDocumentQuery?.isLoading ?? false;
  const documentsByKey = useMemo(() => {
    const entries = selectedDocumentNotes.map((note, index) => [
      getNoteIdentityKey(note),
      documentQueryResults[index]?.data,
    ] as const);
    return new Map(entries);
  }, [documentQueryResults, selectedDocumentNotes]);

  const refetchDocumentByIdentity = useCallback((note: NoteIdentity) => {
    const query = documentQueriesByKey.get(getNoteIdentityKey(note));
    if (query) {
      return query.refetch();
    }

    if (!api) {
      return Promise.reject(new Error('Electron API is unavailable.'));
    }

    return api.hackmd.getNote(note.id, note.teamPath);
  }, [api, documentQueriesByKey]);
  const refetchSelectedDocument = useCallback(() => {
    if (!selectedNote) {
      return Promise.reject(new Error('No note selected.'));
    }

    return refetchDocumentByIdentity(selectedNote);
  }, [refetchDocumentByIdentity, selectedNote]);

  const documentQuery = useMemo(() => ({
    data: documentData,
    isFetching: documentIsFetching,
    isLoading: documentIsLoading,
    refetch: refetchSelectedDocument,
  }), [documentData, documentIsFetching, documentIsLoading, refetchSelectedDocument]);

  const documentQueries = useMemo(() => ({
    byKey: documentQueriesByKey,
    documentsByKey,
    refetchByIdentity: refetchDocumentByIdentity,
  }), [documentQueriesByKey, documentsByKey, refetchDocumentByIdentity]);

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
    documentQuery,
  }), [
    documentQuery,
    folderOrderData,
    folderOrderIsFetching,
    folderOrderIsLoading,
    foldersData,
    foldersIsFetching,
    foldersIsLoading,
    notesData,
    notesIsFetching,
    notesIsLoading,
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
    documentsByKey,
    documentQueries,
    queries,
  };
}
