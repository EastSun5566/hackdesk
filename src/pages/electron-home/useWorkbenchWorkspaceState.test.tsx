import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getScopeStorageKey } from './repository';
import type { WorkspaceScope } from './types';
import {
  FOLDER_COLLAPSED_PREFIX,
  LAST_WORKSPACE_SCOPE_KEY,
  writeStringArrayStorage,
} from './ui-preferences';
import {
  getInitialWorkspaceScope,
  useWorkbenchWorkspaceState,
} from './useWorkbenchWorkspaceState';

describe('useWorkbenchWorkspaceState', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('reads the last workspace scope from storage', () => {
    const teamScope: WorkspaceScope = { type: 'team', label: 'Design', teamPath: 'design' };
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify(teamScope));

    expect(getInitialWorkspaceScope()).toEqual(teamScope);
  });

  it('restores collapsed folders and clears folder selection when scope changes', () => {
    const initialWorkspaceScope: WorkspaceScope = { type: 'personal', label: 'My Workspace' };
    const teamScope: WorkspaceScope = { type: 'team', label: 'Design', teamPath: 'design' };
    writeStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${getScopeStorageKey(teamScope)}`, new Set(['folder-a']));
    const manualEmptyWorkspaceRef = { current: true };
    const { result } = renderHook(() => useWorkbenchWorkspaceState({
      initialWorkspaceScope,
      manualEmptyWorkspaceRef,
    }));

    act(() => {
      result.current.setSelectedFolderId('folder-b');
      result.current.setWorkspaceScope(teamScope);
    });

    expect(result.current.scope).toEqual(teamScope);
    expect(result.current.scopeStorageKey).toBe('team:design');
    expect(result.current.selectedFolderId).toBeNull();
    expect(result.current.collapsedFolderIds).toEqual(new Set(['folder-a']));
    expect(manualEmptyWorkspaceRef.current).toBe(false);
    expect(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY)).toContain('design');
  });
});
