import type { WorkspaceScope } from './types';

export function workspaceRootLabel(scope: WorkspaceScope) {
  if (scope.type === 'history') return null;
  if (scope.type === 'personal') return 'My Notes';
  return scope.label;
}

export function trashNavigatorRowLabel(scope: WorkspaceScope) {
  return scope.type === 'team' ? 'Team Trash' : 'My Trash';
}
