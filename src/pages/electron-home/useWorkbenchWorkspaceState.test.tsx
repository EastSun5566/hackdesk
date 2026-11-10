import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { encodeWindowWorkspaceScope } from '@/lib/window-workspace';
import { getScopeStorageKey } from './repository';
import type { WorkspaceScope } from './types';
import {
  FOLDER_EXPANDED_PREFIX,
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

  it('boots into the workspace named by the window URL', () => {
    window.location.hash = `#/electron?workspace=${encodeWindowWorkspaceScope({ type: 'team', label: 'Design', teamPath: 'design' })}`;
    try {
      expect(getInitialWorkspaceScope()).toEqual({ type: 'team', label: 'Design', teamPath: 'design' });
    } finally {
      window.location.hash = '';
    }
  });

  it('ignores a damaged workspace in the window URL and falls back to storage', () => {
    window.location.hash = '#/electron?workspace=%7Bbroken';
    try {
      expect(getInitialWorkspaceScope()).toEqual({ type: 'personal', label: 'My Workspace' });
    } finally {
      window.location.hash = '';
    }
  });

  it('waits for settings and an existing vault identity without falling back to initial drafts', () => {
    const initialProps: { ready: boolean; vaultId: string | null } = { ready: false, vaultId: null };
    const { result, rerender } = renderHook(({ ready, vaultId }: { ready: boolean; vaultId: string | null }) => useWorkbenchWorkspaceState({
      initialWorkspaceScope: { type: 'local', label: 'Local Vault' },
      settingsReady: ready,
      localVaultId: vaultId,
      manualEmptyWorkspaceRef: { current: false },
    }), { initialProps });
    expect(result.current.scopeStorageKey).toBeNull();
    rerender({ ready: true, vaultId: null });
    expect(result.current.scope.type).toBe('local');
    expect(result.current.scopeStorageKey).toBeNull();
    rerender({ ready: true, vaultId: 'vault-a' });
    expect(result.current.scopeStorageKey).toBe('local:vault-a');
  });

  it('restores expanded folders and clears folder selection when scope changes', () => {
    const initialWorkspaceScope: WorkspaceScope = { type: 'personal', label: 'My Workspace' };
    const teamScope: WorkspaceScope = { type: 'team', label: 'Design', teamPath: 'design' };
    writeStringArrayStorage(`${FOLDER_EXPANDED_PREFIX}${getScopeStorageKey(teamScope)}`, new Set(['folder-a']));
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
    expect(result.current.expandedFolderIds).toEqual(new Set(['folder-a']));
    expect(manualEmptyWorkspaceRef.current).toBe(false);
    expect(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY)).toContain('design');
  });

  it('keeps one scope for a named set while each of its folders keeps its own tree state', () => {
    window.localStorage.setItem('hackdesk_note_workspace:local:snap-a', JSON.stringify({ version: 3, scopeKey: 'local:snap-a', tabs: {} }));
    writeStringArrayStorage(`${FOLDER_EXPANDED_PREFIX}local:snap-a`, new Set(['local-folder:Plans']));
    writeStringArrayStorage(`${FOLDER_EXPANDED_PREFIX}local:snap-b`, new Set(['local-folder:Drafts']));
    const manualEmptyWorkspaceRef = { current: false };
    const { result, rerender } = renderHook(
      ({ localVaultId }: { localVaultId: string }) => useWorkbenchWorkspaceState({
        initialWorkspaceScope: { type: 'local', label: 'Work' },
        localVaultId,
        localWorkspaceId: 'work',
        manualEmptyWorkspaceRef,
      }),
      { initialProps: { localVaultId: 'snap-a' } },
    );

    expect(result.current.scopeStorageKey).toBe('local-workspace:work');
    expect(result.current.folderStateKey).toBe('local:snap-a');
    expect(result.current.expandedFolderIds).toEqual(new Set(['local-folder:Plans']));
    // The set starts with the tabs its first folder had on its own.
    expect(JSON.parse(window.localStorage.getItem('hackdesk_note_workspace:local-workspace:work') ?? 'null'))
      .toMatchObject({ scopeKey: 'local-workspace:work' });

    act(() => { result.current.setSelectedFolderId('local-folder:Plans'); });
    rerender({ localVaultId: 'snap-b' });

    expect(result.current.scopeStorageKey).toBe('local-workspace:work');
    expect(result.current.folderStateKey).toBe('local:snap-b');
    expect(result.current.expandedFolderIds).toEqual(new Set(['local-folder:Drafts']));
    // Folder ids are paths, so a selection from A must not carry into B.
    expect(result.current.selectedFolderId).toBeNull();
  });
});
