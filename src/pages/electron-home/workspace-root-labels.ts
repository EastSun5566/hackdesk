import type { WorkspaceScope } from './types';

/**
 * The sidebar root shows the vault's folder name instead of the generic
 * workspace label, so two vaults are told apart at a glance.
 */
export function workspaceRootLabel(scope: WorkspaceScope, localFolderName?: string | null) {
  if (scope.type === 'history') return null;
  if (scope.type === 'personal') return 'My Notes';
  if (scope.type === 'local' && localFolderName) return localFolderName;
  return scope.label;
}

/** The last path segment: what a vault is called everywhere but its full path. */
export function localVaultFolderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function trashNavigatorRowLabel(scope: WorkspaceScope) {
  return scope.type === 'team' ? 'Team Trash' : 'My Trash';
}
