import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSwitcherLocalFolders } from './useHomeWorkspaceProps';
import { WorkspaceNavigationProvider, useWorkspaceNavigation, type WorkspaceNavigation } from './WorkspaceNavigationContext';

const SCOPE = { type: 'personal', label: 'My Workspace' } as const;
const TEAMS: WorkspaceNavigation['teams'] = [];
const VAULTS: WorkspaceNavigation['localVaults'] = [];

/** What the workbench builds on each render: the same data, new callbacks. */
function navigation(overrides: Partial<WorkspaceNavigation> = {}): WorkspaceNavigation {
  return {
    scope: SCOPE,
    teams: TEAMS,
    localVaults: VAULTS,
    platform: 'darwin',
    pinnedTeamIds: null,
    onScopeChange: vi.fn(),
    onSwitchLocalVault: vi.fn(),
    onChooseLocalVault: vi.fn(),
    onOpenSettings: vi.fn(),
    onPinnedTeamIdsChange: vi.fn(),
    ...overrides,
  };
}

/** Reads the context under a provider whose value `rerender(next)` replaces, as the workbench does. */
function renderNavigation(initial: WorkspaceNavigation) {
  const holder = { value: initial };
  const view = renderHook(() => useWorkspaceNavigation(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <WorkspaceNavigationProvider value={holder.value}>{children}</WorkspaceNavigationProvider>
    ),
  });
  return {
    result: view.result,
    rerender: (next: WorkspaceNavigation) => {
      holder.value = next;
      view.rerender();
    },
  };
}

describe('WorkspaceNavigationProvider', () => {
  it('keeps its value while the workbench re-renders with the same data and new callbacks', () => {
    const { result, rerender } = renderNavigation(navigation());
    const first = result.current;

    const latest = navigation();
    rerender(latest);
    expect(result.current).toBe(first);

    // The kept callbacks call the latest ones.
    first.onScopeChange({ type: 'history', label: 'History' });
    expect(latest.onScopeChange).toHaveBeenCalledWith({ type: 'history', label: 'History' });
  });

  it('gives a new value when a field changes', () => {
    const { result, rerender } = renderNavigation(navigation());
    const first = result.current;
    rerender(navigation({ activeLocalVaultId: 'vault-b' }));
    expect(result.current).not.toBe(first);
    expect(result.current.activeLocalVaultId).toBe('vault-b');
    expect(result.current.onScopeChange).toBe(first.onScopeChange);
  });

  it('asks for the provider when read outside one', () => {
    expect(() => renderHook(() => useWorkspaceNavigation())).toThrow('WorkspaceNavigationProvider');
  });
});

describe('useSwitcherLocalFolders', () => {
  it('keeps the lists while the local folder settings stay the same', () => {
    const localVault = {
      vaults: [{ id: 'a', path: '/vault/A' }],
      activeVaultId: 'a',
      workspaces: [{ id: 'work', name: 'Work', vaultIds: ['a'] }],
      activeWorkspaceId: 'work',
    };
    const { result, rerender } = renderHook(({ settings }) => useSwitcherLocalFolders(settings), {
      initialProps: { settings: localVault },
    });
    const first = result.current;
    expect(first.localWorkspaces).toEqual([{ id: 'work', name: 'Work', vaultIds: ['a'] }]);

    rerender({ settings: localVault });
    expect(result.current.localVaults).toBe(first.localVaults);
    expect(result.current.localWorkspaces).toBe(first.localWorkspaces);

    rerender({ settings: { ...localVault, workspaces: [] } });
    expect(result.current.localWorkspaces).toEqual([]);
  });

  it('gives the same empty list before the settings load', () => {
    const { result, rerender } = renderHook(() => useSwitcherLocalFolders(undefined));
    const first = result.current.localVaults;
    rerender();
    expect(result.current.localVaults).toBe(first);
  });
});
