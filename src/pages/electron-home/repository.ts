import type {
  ElectronSafeSettings,
  FolderSummary,
  NoteSummary,
  RepositoryValue,
  TeamSummary,
} from '@/lib/electron-api';

import type { WorkspaceScope } from './types';

export const EMPTY_NOTES: NoteSummary[] = [];
export const EMPTY_TEAMS: TeamSummary[] = [];
export const EMPTY_FOLDERS: FolderSummary[] = [];

export function unwrapRepositoryValue<T>(value?: RepositoryValue<T>) {
  if (!value || value.source === 'error') {
    return value?.data;
  }

  return value.data;
}

export function getRepositoryError<T>(value?: RepositoryValue<T>) {
  return value?.source === 'error' ? value.error : null;
}

export function isShowingCachedFallback<T>(value?: RepositoryValue<T>) {
  return value?.source === 'error' && value.data !== undefined;
}

export function getWorkspaceQueryKey(scope: WorkspaceScope) {
  if (scope.type === 'team') {
    return ['electron', 'hackmd', 'team-notes', scope.teamPath] as const;
  }

  return ['electron', 'hackmd', scope.type === 'history' ? 'history' : 'notes'] as const;
}

export function getFoldersQueryKey(scope: WorkspaceScope) {
  if (scope.type === 'team') {
    return ['electron', 'hackmd', 'team-folders', scope.teamPath] as const;
  }

  return ['electron', 'hackmd', 'folders'] as const;
}

export function getScopeStorageKey(scope: WorkspaceScope) {
  return scope.type === 'team' ? `team:${scope.teamPath}` : scope.type;
}

export function isTokenConfigured(settings?: ElectronSafeSettings) {
  return settings?.hasHackmdApiToken === true;
}
