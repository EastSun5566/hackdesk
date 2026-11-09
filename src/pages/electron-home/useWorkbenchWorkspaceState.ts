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
import { getScopeStorageKey } from './repository';
import { INITIAL_DRAFT_SCOPE_KEY } from './initial-draft-workspace';

export const DEFAULT_WORKSPACE_SCOPE: WorkspaceScope = { type: 'personal', label: 'My Workspace' };

export type WorkbenchWorkspaceStateOptions = {
  localVaultId?: string | null;
  initialWorkspaceScope: WorkspaceScope;
  initialDrafts?: boolean;
  settingsReady?: boolean;
  manualEmptyWorkspaceRef: MutableRefObject<boolean>;
};

export type WorkbenchWorkspaceState = {
  expandedFolderIds: Set<string>;
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
      return { type: scoped.type, label: scoped.label };
    }
  }
  return readWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, DEFAULT_WORKSPACE_SCOPE);
}

export function useWorkbenchWorkspaceState({
  initialWorkspaceScope,
  localVaultId,
  initialDrafts = false,
  settingsReady = true,
  manualEmptyWorkspaceRef,
}: WorkbenchWorkspaceStateOptions): WorkbenchWorkspaceState {
  const [storedScope, setScopeState] = useState<WorkspaceScope>(() => initialWorkspaceScope);
  const scope = useMemo(() => initialDrafts ? DEFAULT_WORKSPACE_SCOPE : storedScope.type === 'local'
    ? { ...storedScope, vaultId: localVaultId ?? undefined }
    : storedScope, [storedScope, localVaultId, initialDrafts]);
  const scopeStorageKey = !settingsReady ? null : initialDrafts ? INITIAL_DRAFT_SCOPE_KEY : getScopeStorageKey(scope);
  const [folderScopeKey, setFolderScopeKey] = useState(scopeStorageKey);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => scopeStorageKey
    ? readStringArrayStorage(`${FOLDER_EXPANDED_PREFIX}${scopeStorageKey}`) : new Set<string>());
  if (folderScopeKey !== scopeStorageKey) {
    setFolderScopeKey(scopeStorageKey);
    setExpandedFolderIds(scopeStorageKey
      ? readStringArrayStorage(`${FOLDER_EXPANDED_PREFIX}${scopeStorageKey}`) : new Set<string>());
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
    initialScopeStorageKey: scopeStorageKey,
    scope,
    scopeStorageKey,
    selectedFolderId,
    setExpandedFolderIds,
    setSelectedFolderId,
    setWorkspaceScope,
  };
}
