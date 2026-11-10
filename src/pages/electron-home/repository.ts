import type {
  ElectronSafeSettings,
  FolderOrder,
  FolderSummary,
  NoteSummary,
  RepositoryValue,
  TeamSummary,
} from '@/lib/electron-api';

import type { WorkspaceScope } from './types';

export const EMPTY_NOTES: NoteSummary[] = [];
export const EMPTY_TEAMS: TeamSummary[] = [];
export const EMPTY_FOLDERS: FolderSummary[] = [];
export const EMPTY_FOLDER_ORDER: FolderOrder = {};

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
  if (scope.type === 'local') {
    return ['electron', 'local-vault', 'notes'] as const;
  }

  if (scope.type === 'team') {
    return ['electron', 'hackmd', 'team-notes', scope.teamPath] as const;
  }

  return ['electron', 'hackmd', scope.type === 'history' ? 'history' : 'notes'] as const;
}

export function getFoldersQueryKey(scope: WorkspaceScope) {
  if (scope.type === 'local') {
    return ['electron', 'local-vault', 'folders'] as const;
  }

  if (scope.type === 'team') {
    return ['electron', 'hackmd', 'team-folders', scope.teamPath] as const;
  }

  return ['electron', 'hackmd', 'folders'] as const;
}

export function getFolderOrderQueryKey(scope: WorkspaceScope) {
  if (scope.type === 'local') {
    return ['electron', 'local-vault', 'folder-order'] as const;
  }

  if (scope.type === 'team') {
    return ['electron', 'hackmd', 'team-folder-order', scope.teamPath] as const;
  }

  return ['electron', 'hackmd', 'folder-order'] as const;
}

export function getScopeStorageKey(scope: WorkspaceScope) {
  if (scope.type === 'local') {
    if (!scope.vaultId) return null;
    // Every folder of a named set shares its tabs, search and pending edits.
    return scope.workspaceId ? `local-workspace:${scope.workspaceId}` : `local:${scope.vaultId}`;
  }
  return scope.type === 'team' ? `team:${scope.teamPath}` : scope.type;
}

export function isTokenConfigured(settings?: ElectronSafeSettings) {
  return settings?.hasHackmdApiToken === true;
}

/**
 * Where one folder keeps its own tree state (expanded folders), even inside a named set: folder
 * ids are paths, so two folders of a set would otherwise share them.
 */
export function getFolderStateStorageKey(scope: WorkspaceScope) {
  return scope.type === 'local' && scope.vaultId ? `local:${scope.vaultId}` : getScopeStorageKey(scope);
}
