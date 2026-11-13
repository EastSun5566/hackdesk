import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useStableCallbacks } from '@/lib/stable-props';

import type { WorkspaceSidebarProps } from './WorkspaceSwitcher';

/**
 * Which workspace the window shows and which it can switch to: the switcher at the top of the
 * sidebar and the account row at its bottom read it here, instead of through the navigator.
 */
export type WorkspaceNavigation = WorkspaceSidebarProps;

const WorkspaceNavigationContext = createContext<WorkspaceNavigation | null>(null);

/**
 * The workbench rebuilds `value` on every render (each keystroke in the editor). Its callbacks go
 * through stable wrappers and the context value changes only when a field does, so the sidebar,
 * which skips renders on purpose, re-renders only when the workspace data changes.
 */
export function WorkspaceNavigationProvider({ value, children }: { value: WorkspaceNavigation; children: ReactNode }) {
  const {
    scope,
    user,
    teams,
    accountStatus,
    localVaults,
    localWorkspaces,
    activeLocalVaultId,
    activeLocalWorkspaceId,
    onActivateLocalWorkspace,
    onOpenLocalWorkspaceFolder,
    onOpenStandaloneLocalVault,
    platform,
    pinnedTeamIds,
    onScopeChange,
    onSwitchLocalVault,
    onChooseLocalVault,
    onManageLocalVaults,
    onOpenInNewWindow,
    onOpenSettings,
    onSignOut,
    onPinnedTeamIdsChange,
  } = useStableCallbacks(value);
  const navigation = useMemo<WorkspaceNavigation>(() => ({
    scope,
    user,
    teams,
    accountStatus,
    localVaults,
    localWorkspaces,
    activeLocalVaultId,
    activeLocalWorkspaceId,
    onActivateLocalWorkspace,
    onOpenLocalWorkspaceFolder,
    onOpenStandaloneLocalVault,
    platform,
    pinnedTeamIds,
    onScopeChange,
    onSwitchLocalVault,
    onChooseLocalVault,
    onManageLocalVaults,
    onOpenInNewWindow,
    onOpenSettings,
    onSignOut,
    onPinnedTeamIdsChange,
  }), [
    scope,
    user,
    teams,
    accountStatus,
    localVaults,
    localWorkspaces,
    activeLocalVaultId,
    activeLocalWorkspaceId,
    onActivateLocalWorkspace,
    onOpenLocalWorkspaceFolder,
    onOpenStandaloneLocalVault,
    platform,
    pinnedTeamIds,
    onScopeChange,
    onSwitchLocalVault,
    onChooseLocalVault,
    onManageLocalVaults,
    onOpenInNewWindow,
    onOpenSettings,
    onSignOut,
    onPinnedTeamIdsChange,
  ]);
  return <WorkspaceNavigationContext.Provider value={navigation}>{children}</WorkspaceNavigationContext.Provider>;
}

export function useWorkspaceNavigation(): WorkspaceNavigation {
  const navigation = useContext(WorkspaceNavigationContext);
  if (!navigation) throw new Error('Workspace navigation is read inside WorkspaceNavigationProvider.');
  return navigation;
}
