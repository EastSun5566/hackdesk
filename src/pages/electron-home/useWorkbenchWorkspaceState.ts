import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { WorkspaceScope } from './types';
import { readWindowWorkspaceFromLocation } from '@/lib/window-workspace';
import {
  FOLDER_EXPANDED_PREFIX,
  LAST_WORKSPACE_SCOPE_KEY,
  readStringArrayStorage,
  readWorkspaceScopeStorage,
  writeWorkspaceScopeStorage,
} from './ui-preferences';
import { getFolderStateStorageKey, getScopeStorageKey } from './repository';
import { seedLocalWorkspaceStorage } from './local-workspace-storage';
import { INITIAL_DRAFT_SCOPE_KEY } from './initial-draft-workspace';

export const DEFAULT_WORKSPACE_SCOPE: WorkspaceScope = { type: 'personal', label: 'My Workspace' };

export type WorkbenchWorkspaceStateOptions = {
  localVaultId?: string | null;
  /** The named set the open folder belongs to; its folders then share one scope. */
  localWorkspaceId?: string | null;
  initialWorkspaceScope: WorkspaceScope;
  initialDrafts?: boolean;
  settingsReady?: boolean;
  manualEmptyWorkspaceRef: MutableRefObject<boolean>;
};

export type WorkbenchWorkspaceState = {
  expandedFolderIds: Set<string>;
  /** Where the open folder's tree state is kept; differs from the scope inside a named set. */
  folderStateKey: string | null;
  initialScopeStorageKey: string | null;
  scope: WorkspaceScope;
  scopeStorageKey: string | null;
  selectedFolderId: string | null;
  setExpandedFolderIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedFolderId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceScope: (scope: WorkspaceScope) => void;
};

export function hasWindowWorkspaceScope() {
  return typeof window !== 'undefined' && readWindowWorkspaceFromLocation(window.location) !== null;
}

export function getInitialWorkspaceScope(): WorkspaceScope {
  // A window opened onto a workspace carries it in its URL, so the first render already shows it.
  if (typeof window !== 'undefined') {
    const scoped = readWindowWorkspaceFromLocation(window.location);
    if (scoped?.type === 'team' && scoped.teamPath) {
      return { type: 'team', label: scoped.label, teamPath: scoped.teamPath };
    }
    if (scoped && scoped.type !== 'team') {
      return scoped.type === 'local' && scoped.vaultId
        ? { type: scoped.type, label: scoped.label, vaultId: scoped.vaultId }
        : { type: scoped.type, label: scoped.label };
    }
  }
  return readWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, DEFAULT_WORKSPACE_SCOPE);
}

export function useWorkbenchWorkspaceState({
  initialWorkspaceScope,
  localVaultId,
  localWorkspaceId,
  initialDrafts = false,
  settingsReady = true,
  manualEmptyWorkspaceRef,
}: WorkbenchWorkspaceStateOptions): WorkbenchWorkspaceState {
  const [storedScope, setScopeState] = useState<WorkspaceScope>(() => initialWorkspaceScope);
  const scope = useMemo<WorkspaceScope>(() => initialDrafts ? DEFAULT_WORKSPACE_SCOPE : storedScope.type === 'local'
    ? {
      type: 'local',
      label: storedScope.label,
      vaultId: localVaultId ?? undefined,
      ...(localWorkspaceId && localVaultId ? { workspaceId: localWorkspaceId } : {}),
    }
    : storedScope, [storedScope, localVaultId, localWorkspaceId, initialDrafts]);
  const scopeStorageKey = !settingsReady ? null : initialDrafts ? INITIAL_DRAFT_SCOPE_KEY : getScopeStorageKey(scope);
  const folderStateKey = !settingsReady ? null : initialDrafts ? INITIAL_DRAFT_SCOPE_KEY : getFolderStateStorageKey(scope);
  // Seeded before the tabs read their scope, in the same render.
  if (scopeStorageKey && folderStateKey && scopeStorageKey !== folderStateKey && typeof window !== 'undefined') {
    seedLocalWorkspaceStorage(window.localStorage, scopeStorageKey, folderStateKey);
  }
  // Opening another folder of a set changes only this key: the tree state follows the folder,
  // while tabs and search stay with the set.
  const [folderScopeKey, setFolderScopeKey] = useState(folderStateKey);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => folderStateKey
    ? readStringArrayStorage(`${FOLDER_EXPANDED_PREFIX}${folderStateKey}`) : new Set<string>());
  if (folderScopeKey !== folderStateKey) {
    setFolderScopeKey(folderStateKey);
    setExpandedFolderIds(folderStateKey
      ? readStringArrayStorage(`${FOLDER_EXPANDED_PREFIX}${folderStateKey}`) : new Set<string>());
    setSelectedFolderId(null);
  }
  useLayoutEffect(() => { manualEmptyWorkspaceRef.current = false; }, [scopeStorageKey, manualEmptyWorkspaceRef]);

  const setWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    manualEmptyWorkspaceRef.current = false;
    setScopeState(nextScope);
    writeWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, nextScope);
    setSelectedFolderId(null);
  }, [manualEmptyWorkspaceRef]);

  return {
    expandedFolderIds,
    folderStateKey,
    initialScopeStorageKey: scopeStorageKey,
    scope,
    scopeStorageKey,
    selectedFolderId,
    setExpandedFolderIds,
    setSelectedFolderId,
    setWorkspaceScope,
  };
}
