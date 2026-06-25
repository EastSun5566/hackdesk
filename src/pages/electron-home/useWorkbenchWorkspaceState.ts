import { useCallback, useMemo, useState } from 'react';
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
  initialWorkspaceScope: WorkspaceScope;
  manualEmptyWorkspaceRef: MutableRefObject<boolean>;
};

export type WorkbenchWorkspaceState = {
  collapsedFolderIds: Set<string>;
  initialScopeStorageKey: string;
  scope: WorkspaceScope;
  scopeStorageKey: string;
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
  manualEmptyWorkspaceRef,
}: WorkbenchWorkspaceStateOptions): WorkbenchWorkspaceState {
  const initialScopeStorageKey = useMemo(() => getScopeStorageKey(initialWorkspaceScope), [initialWorkspaceScope]);
  const [scope, setScopeState] = useState<WorkspaceScope>(() => initialWorkspaceScope);
  const scopeStorageKey = useMemo(() => getScopeStorageKey(scope), [scope]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(() => (
    readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${initialScopeStorageKey}`)
  ));

  const setWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    const nextScopeStorageKey = getScopeStorageKey(nextScope);
    manualEmptyWorkspaceRef.current = false;
    setScopeState(nextScope);
    writeWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, nextScope);
    setCollapsedFolderIds(readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${nextScopeStorageKey}`));
    setSelectedFolderId(null);
  }, [manualEmptyWorkspaceRef]);

  return {
    collapsedFolderIds,
    initialScopeStorageKey,
    scope,
    scopeStorageKey,
    selectedFolderId,
    setCollapsedFolderIds,
    setSelectedFolderId,
    setWorkspaceScope,
  };
}
