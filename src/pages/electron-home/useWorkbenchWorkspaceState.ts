import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { WorkspaceScope } from './types';
import {
  FOLDER_COLLAPSED_PREFIX,
  LAST_WORKSPACE_SCOPE_KEY,
  readStringArrayStorage,
  readWorkspaceScopeStorage,
  writeWorkspaceScopeStorage,
} from './ui-preferences';
import { getScopeStorageKey } from './repository';

export const DEFAULT_WORKSPACE_SCOPE: WorkspaceScope = { type: 'personal', label: 'My Workspace' };

export type WorkbenchWorkspaceStateOptions = {
  localVaultId?: string | null;
  initialWorkspaceScope: WorkspaceScope;
  manualEmptyWorkspaceRef: MutableRefObject<boolean>;
};

export type WorkbenchWorkspaceState = {
  collapsedFolderIds: Set<string>;
  initialScopeStorageKey: string | null;
  scope: WorkspaceScope;
  scopeStorageKey: string | null;
  selectedFolderId: string | null;
  setCollapsedFolderIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedFolderId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceScope: (scope: WorkspaceScope) => void;
};

export function getInitialWorkspaceScope() {
  return readWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, DEFAULT_WORKSPACE_SCOPE);
}

export function useWorkbenchWorkspaceState({
  initialWorkspaceScope,
  localVaultId,
  manualEmptyWorkspaceRef,
}: WorkbenchWorkspaceStateOptions): WorkbenchWorkspaceState {
  const [storedScope, setScopeState] = useState<WorkspaceScope>(() => initialWorkspaceScope);
  const scope = useMemo(() => storedScope.type === 'local'
    ? { ...storedScope, vaultId: localVaultId ?? undefined }
    : storedScope, [storedScope, localVaultId]);
  const scopeStorageKey = getScopeStorageKey(scope);
  const [folderScopeKey, setFolderScopeKey] = useState(scopeStorageKey);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(() => scopeStorageKey
    ? readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${scopeStorageKey}`) : new Set<string>());
  if (folderScopeKey !== scopeStorageKey) {
    setFolderScopeKey(scopeStorageKey);
    setCollapsedFolderIds(scopeStorageKey
      ? readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${scopeStorageKey}`) : new Set<string>());
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
    collapsedFolderIds,
    initialScopeStorageKey: scopeStorageKey,
    scope,
    scopeStorageKey,
    selectedFolderId,
    setCollapsedFolderIds,
    setSelectedFolderId,
    setWorkspaceScope,
  };
}
