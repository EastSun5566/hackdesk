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
  const settingsQuery = useQuery({
    queryKey: ['electron', 'settings'],
    queryFn: () => api?.settings.get(),
    enabled: !!api,
  });
  const settings = settingsQuery.data;
  const hasToken = isTokenConfigured(settings);

  const userQuery = useQuery({
    queryKey: ['electron', 'hackmd', 'current-user'],
    queryFn: () => api?.hackmd.getCurrentUser(),
    enabled: !!api && hasToken,
  });

  const teamsQuery = useQuery({
    queryKey: ['electron', 'hackmd', 'teams'],
    queryFn: () => api?.hackmd.listTeams(),
    enabled: !!api && hasToken,
  });

  const notesQuery = useQuery({
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

  const foldersQuery = useQuery({
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

  const folderOrderQuery = useQuery({
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

  const documentQuery = useQuery({
    queryKey: ['electron', 'hackmd', 'note', selectedNote?.teamPath ?? null, selectedNote?.id],
    queryFn: () => {
      if (!api || !selectedNote) {
        throw new Error('No note selected.');
      }

      return api.hackmd.getNote(selectedNote.id, selectedNote.teamPath);
    },
    enabled: !!api && !!selectedNote,
  });

  return {
    settings,
    hasToken,
    user: unwrapRepositoryValue(userQuery.data),
    teams: unwrapRepositoryValue(teamsQuery.data) ?? EMPTY_TEAMS,
    currentNotes: unwrapRepositoryValue(notesQuery.data) ?? EMPTY_NOTES,
    currentFolders: unwrapRepositoryValue(foldersQuery.data) ?? EMPTY_FOLDERS,
    currentFolderOrder: unwrapRepositoryValue(folderOrderQuery.data) ?? EMPTY_FOLDER_ORDER,
    document: unwrapRepositoryValue(documentQuery.data),
    queries: {
      settingsQuery,
      userQuery,
      teamsQuery,
      notesQuery,
      foldersQuery,
      folderOrderQuery,
      documentQuery,
    },
  };
}
