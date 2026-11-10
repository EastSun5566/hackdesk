import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import type {
  LocalVaultActivateResult,
  LocalVaultSnapshot,
  LocalVaultForgetResult,
  LocalWorkspaceMutation,
  LocalWorkspaceMutationResult,
} from '@/lib/local-vault';
import { getActiveLocalVaultPath, getActiveLocalWorkspace } from '@/lib/settings';
import {
  cacheLocalVaultSnapshot,
  getLocalVaultSnapshotQueryKey,
  getLocalVaultVaultSnapshotQueryKey,
  guardLocalVaultApi,
  type VaultAccess,
} from './local-vault-query';
import { migrateLocalWorkspaceStorage } from './local-workspace-storage';

/**
 * The workspace session API: the raw Electron API with vault-changing writes
 * routed through the change transition (like choose/disconnect), so concurrent
 * vault reads are cancelled instead of racing the switch.
 */
export type LocalVaultSessionApi = Omit<HackDeskElectronAPI, 'localVault'> & {
  localVault: HackDeskElectronAPI['localVault'] & {
    switchVault: (vaultId: string) => Promise<LocalVaultActivateResult>;
    forgetVault: (vaultId: string) => Promise<LocalVaultForgetResult>;
    updateWorkspace: (mutation: LocalWorkspaceMutation) => Promise<LocalWorkspaceMutationResult>;
    /** Saves a new folder order for a working set without reloading the open folder. */
    reorderWorkspace: (id: string, vaultIds: string[]) => Promise<void>;
    /**
     * Opens another folder of the open working set. Tabs belong to the set, so nothing is flushed
     * or cancelled: the tree swaps to the folder's cached snapshot and the scan only confirms it.
     */
    focusVault: (vaultId: string) => Promise<LocalVaultActivateResult>;
  };
};

export function useLocalVaultSession(
  api: HackDeskElectronAPI | undefined,
  settings: ElectronSafeSettings | undefined,
  beforeChange: MutableRefObject<() => void>,
  /** Opens the in-app folder picker; falls back to the native dialog when absent. */
  pickFolder?: (startPath?: string | null) => Promise<string | null>,
) {
  const queryClient = useQueryClient();
  const path = getActiveLocalVaultPath(settings);
  const [changing, setChanging] = useState(false);
  const access = useRef<VaultAccess>({ generation: 0, transitions: 0, vaultId: null, changing: false });
  const [transitions, setTransitions] = useState(0);
  const [context, setContext] = useState({ path, vaultId: null as string | null, generation: 0 });
  const snapshotQuery = useQuery({
    queryKey: getLocalVaultSnapshotQueryKey(path),
    networkMode: 'always',
    queryFn: async ({ signal }) => {
      const generation = access.current.generation;
      const snapshot = await api?.localVault.getSnapshot() ?? null;
      signal.throwIfAborted();
      if (generation !== access.current.generation) throw new Error('The active Local Vault changed during loading.');
      return snapshot;
    },
    enabled: !!api && !!path && !changing,
  });
  const loaded = path ? snapshotQuery.data ?? null : null;
  const [migration, setMigration] = useState<{ vaultId: string | null; error: string | null }>({ vaultId: null, error: null });
  // Before paint: a folder opened from its cached snapshot must not render one empty frame.
  useLayoutEffect(() => {
    if (!loaded) return;
    try {
      migrateLocalWorkspaceStorage(window.localStorage, loaded);
      setMigration({ vaultId: loaded.vaultId, error: null });
    } catch {
      setMigration({ vaultId: loaded.vaultId, error: 'Local Vault state could not be restored. Free storage space and refresh the vault.' });
    }
  }, [loaded, snapshotQuery.dataUpdatedAt]);
  const snapshot = loaded?.vaultId === migration.vaultId && !migration.error ? loaded : null;
  const vaultId = snapshot?.vaultId ?? null;
  if (context.path !== path || context.vaultId !== vaultId) {
    setContext({ path, vaultId, generation: context.generation + 1 });
  }
  const generation = context.generation;
  useLayoutEffect(() => {
    access.current = { generation, transitions, vaultId, changing };
  }, [generation, transitions, vaultId, changing]);

  useEffect(() => {
    if (!api || !path || changing) return;
    const generation = access.current.generation;
    return api.localVault.onDidChange(({ snapshot: next }) => {
      if (access.current.generation !== generation || access.current.changing) return;
      if (!next) return;
      // Another folder's event refreshes only that folder's cache; it never selects the folder.
      if (next.vaultId !== access.current.vaultId) {
        cacheLocalVaultSnapshot(queryClient, next);
        return;
      }
      queryClient.setQueryData(getLocalVaultSnapshotQueryKey(path), next);
    });
  }, [api, path, changing, vaultId, queryClient]);

  const sessionApi = useMemo(() => {
    if (!api) return undefined;
    const guarded = guardLocalVaultApi(api, () => access.current, { generation, transitions, vaultId, changing });
    const transition = async <T,>(operation: () => Promise<T>) => {
      if (access.current.changing) throw new Error('Local Vault is already changing. Try again when it is ready.');
      beforeChange.current();
      access.current.changing = true;
      access.current.generation += 1;
      access.current.transitions = (access.current.transitions ?? 0) + 1;
      setContext((current) => ({ ...current, generation: current.generation + 1 }));
      setTransitions((current) => current + 1);
      setChanging(true);
      try {
        await queryClient.cancelQueries({ queryKey: ['electron', 'local-vault'] });
        return await operation();
      } finally {
        access.current.changing = false;
        setChanging(false);
      }
    };
    return {
      ...guarded,
      localVault: {
        ...guarded.localVault,
        choose: () => transition(async () => {
          if (pickFolder) {
            // Start where the current vault is, so changing vaults is one step.
            const current = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
            const path = await pickFolder(getActiveLocalVaultPath(current) ?? undefined);
            if (!path) {
              return { canceled: true };
            }
            const picked = await api.localVault.choosePath({ path });
            if (picked.settings) {
              queryClient.setQueryData(['electron', 'settings'], picked.settings);
            }
            if (picked.snapshot) queryClient.setQueryData(getLocalVaultSnapshotQueryKey(getActiveLocalVaultPath(picked.settings)), picked.snapshot);
            return picked;
          }
          const result = await api.localVault.choose();
          if (!result.canceled && result.settings) {
            if (result.snapshot) queryClient.setQueryData(getLocalVaultSnapshotQueryKey(getActiveLocalVaultPath(result.settings)), result.snapshot);
            queryClient.setQueryData(['electron', 'settings'], result.settings);
          }
          return result;
        }),
        disconnect: () => transition(async () => {
          const next = await api.localVault.disconnect();
          queryClient.setQueryData(['electron', 'settings'], next);
          return next;
        }),
        switchVault: (vaultId: string) => transition(async () => {
          // Opening a folder outside the working set leaves the set, so the sidebar never shows
          // roots the open folder does not belong to.
          const current = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
          const workspace = getActiveLocalWorkspace(current);
          if (workspace && !workspace.vaultIds.includes(vaultId)) {
            const cleared = await api.localVault.updateWorkspace({ type: 'activate', id: null });
            queryClient.setQueryData(['electron', 'settings'], cleared.settings);
          }
          const result = await api.localVault.activate({ vaultId });
          queryClient.setQueryData(['electron', 'settings'], result.settings);
          if (result.snapshot) {
            queryClient.setQueryData(getLocalVaultSnapshotQueryKey(getActiveLocalVaultPath(result.settings)), result.snapshot);
          }
          return result;
        }),
        updateWorkspace: (mutation: LocalWorkspaceMutation) => transition(async () => {
          const result = await api.localVault.updateWorkspace(mutation);
          queryClient.setQueryData(['electron', 'settings'], result.settings);
          if (result.snapshot) {
            queryClient.setQueryData(getLocalVaultSnapshotQueryKey(getActiveLocalVaultPath(result.settings)), result.snapshot);
          }
          return result;
        }),
        focusVault: async (vaultId: string) => {
          if (access.current.changing) throw new Error('Local Vault is already changing. Try again when it is ready.');
          const current = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
          const workspace = getActiveLocalWorkspace(current);
          const target = current?.localVault.vaults.find((vault) => vault.id === vaultId);
          if (!current || !target || !workspace?.vaultIds.includes(vaultId)) {
            throw new Error('That folder is not in the open workspace.');
          }
          // Show the folder from what the sidebar already holds, then let the scan confirm it.
          const cached = queryClient.getQueryData<LocalVaultSnapshot>(getLocalVaultVaultSnapshotQueryKey(vaultId));
          if (cached) queryClient.setQueryData(getLocalVaultSnapshotQueryKey(target.path), cached);
          queryClient.setQueryData<ElectronSafeSettings>(['electron', 'settings'], {
            ...current,
            localVault: { ...current.localVault, activeVaultId: vaultId },
          });
          try {
            const result = await api.localVault.activate({ vaultId });
            if (result.snapshot) {
              queryClient.setQueryData(getLocalVaultSnapshotQueryKey(getActiveLocalVaultPath(result.settings)), result.snapshot);
            }
            queryClient.setQueryData(['electron', 'settings'], result.settings);
            return result;
          } catch (error) {
            queryClient.setQueryData(['electron', 'settings'], current);
            throw error;
          }
        },
        reorderWorkspace: async (id: string, vaultIds: string[]) => {
          const current = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
          const workspace = current?.localVault.workspaces.find((candidate) => candidate.id === id);
          // Only a pure reorder skips the transition; adding or removing folders can move the
          // active folder, which must cancel reads like any other switch.
          if (!current || !workspace || workspace.vaultIds.length !== vaultIds.length
            || !workspace.vaultIds.every((vaultId) => vaultIds.includes(vaultId))) {
            throw new Error('That folder order no longer matches the workspace.');
          }
          // Show the new order at once; the write only confirms it.
          queryClient.setQueryData<ElectronSafeSettings>(['electron', 'settings'], {
            ...current,
            localVault: {
              ...current.localVault,
              workspaces: current.localVault.workspaces.map((candidate) => (
                candidate.id === id ? { ...candidate, vaultIds } : candidate
              )),
            },
          });
          try {
            const result = await api.localVault.updateWorkspace({ type: 'setVaults', id, vaultIds });
            queryClient.setQueryData(['electron', 'settings'], result.settings);
          } catch (error) {
            queryClient.setQueryData(['electron', 'settings'], current);
            throw error;
          }
        },
        forgetVault: (vaultId: string) => transition(async () => {
          const result = await api.localVault.forget({ vaultId });
          queryClient.setQueryData(['electron', 'settings'], result.settings);
          if (result.snapshot) {
            queryClient.setQueryData(getLocalVaultSnapshotQueryKey(getActiveLocalVaultPath(result.settings)), result.snapshot);
          } else {
            queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), null);
          }
          return result;
        }),
      },
    };
  }, [api, beforeChange, pickFolder, queryClient, generation, transitions, vaultId, changing]);

  const error = migration.vaultId === loaded?.vaultId ? migration.error : null;
  return {
    api: sessionApi,
    snapshot,
    snapshotQuery,
    vaultId,
    isChanging: changing,
    isLoading: !!path && !snapshot && !snapshotQuery.isError && !error,
    error,
  };
}
