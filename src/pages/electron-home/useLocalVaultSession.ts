import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import { getLocalVaultSnapshotQueryKey, guardLocalVaultApi, type VaultAccess } from './local-vault-query';
import { migrateLocalWorkspaceStorage } from './local-workspace-storage';

export function useLocalVaultSession(
  api: HackDeskElectronAPI | undefined,
  settings: ElectronSafeSettings | undefined,
  beforeChange: MutableRefObject<() => void>,
) {
  const queryClient = useQueryClient();
  const path = settings?.localVault.path ?? null;
  const [changing, setChanging] = useState(false);
  const access = useRef<VaultAccess>({ generation: 0, vaultId: null, changing: false });
  const [context, setContext] = useState({ path, vaultId: null as string | null, generation: 0 });
  const snapshotQuery = useQuery({
    queryKey: getLocalVaultSnapshotQueryKey(path),
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
  useEffect(() => {
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
    access.current = { generation, vaultId, changing };
  }, [generation, vaultId, changing]);

  useEffect(() => {
    if (!api || !path || changing) return;
    const generation = access.current.generation;
    return api.localVault.onDidChange(({ snapshot: next }) => {
      if (access.current.generation !== generation || access.current.changing) return;
      // A queued watcher event from another vault must never select that vault.
      if (!next || next.vaultId !== access.current.vaultId) return;
      queryClient.setQueryData(getLocalVaultSnapshotQueryKey(path), next);
    });
  }, [api, path, changing, vaultId, queryClient]);

  const sessionApi = useMemo(() => {
    if (!api) return undefined;
    const guarded = guardLocalVaultApi(api, () => access.current, { generation, vaultId, changing });
    const transition = async <T,>(operation: () => Promise<T>) => {
      if (access.current.changing) throw new Error('Local Vault is already changing. Try again when it is ready.');
      beforeChange.current();
      access.current.changing = true;
      access.current.generation += 1;
      setContext((current) => ({ ...current, generation: current.generation + 1 }));
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
          const result = await api.localVault.choose();
          if (!result.canceled && result.settings) {
            if (result.snapshot) queryClient.setQueryData(getLocalVaultSnapshotQueryKey(result.settings.localVault.path), result.snapshot);
            queryClient.setQueryData(['electron', 'settings'], result.settings);
          }
          return result;
        }),
        disconnect: () => transition(async () => {
          const next = await api.localVault.disconnect();
          queryClient.setQueryData(['electron', 'settings'], next);
          return next;
        }),
      },
    };
  }, [api, beforeChange, queryClient, generation, vaultId, changing]);

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
