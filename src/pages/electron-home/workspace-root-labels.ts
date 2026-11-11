import type { WorkspaceScope } from './types';

/**
 * The sidebar root names what the tree holds, not which workspace this is: the
 * switcher above it already shows the team's name. A vault still shows its
 * folder name, so two vaults are told apart at a glance.
 */
export function workspaceRootLabel(
  scope: WorkspaceScope,
  localFolderName?: string | null,
  localWorkspaceName?: string | null,
) {
  if (scope.type === 'history') return null;
  if (scope.type === 'personal') return 'My Notes';
  // A named working set is the root; its folders are the rows beneath it.
  if (scope.type === 'local') return localWorkspaceName || localFolderName || scope.label;
  // Pairs with the "Team Trash" row the way "My Notes" pairs with "My Trash".
  return 'Team Notes';
}

/** The last path segment: what a vault is called everywhere but its full path. */
export function localVaultFolderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function trashNavigatorRowLabel(scope: WorkspaceScope) {
  return scope.type === 'team' ? 'Team Trash' : 'My Trash';
}
