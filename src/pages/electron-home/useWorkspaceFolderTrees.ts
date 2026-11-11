import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import type { HackDeskElectronAPI } from '@/lib/electron-api';
import { buildHackmdFolderTree, type FolderTree } from '@/lib/hackmd-folders';
import type { LocalVaultSnapshot } from '@/lib/local-vault';

import { adaptLocalVaultSnapshot } from './local-vault-adapter';
import { getLocalVaultVaultSnapshotQueryKey } from './local-vault-query';
import type { WorkspaceFolderTree } from './FolderNavigator';
import { localVaultFolderName } from './workspace-root-labels';
import { useShowHiddenFiles } from './hidden-files-preference';

const EMPTY_TREE: FolderTree = buildHackmdFolderTree([], []);

/**
 * Lists every folder in the open working set, in the set's stored order, so opening one never moves
 * it. The active folder is a placeholder: the navigator shows the live session tree there. The rest
 * are scanned without becoming active.
 */
export function useWorkspaceFolderTrees({
  api,
  activeSnapshot,
  activeSnapshotPath,
  activeVaultId,
  enabled,
  vaultIds,
  vaults,
}: {
  api: HackDeskElectronAPI | undefined;
  /** The open folder's snapshot; cached so the folder shows at once when another one opens. */
  activeSnapshot: LocalVaultSnapshot | null;
  /** The stored path of the folder the session snapshot belongs to. */
  activeSnapshotPath: string | null;
  activeVaultId: string | null;
  enabled: boolean;
  vaultIds: string[];
  vaults: { id: string; path: string }[];
}): WorkspaceFolderTree[] {
  const queryClient = useQueryClient();
  const showHidden = useShowHiddenFiles();
  // Folder caches are keyed by stored id; a snapshot carries its manifest id, which differs. While a
  // folder of the set opens, the session snapshot and the stored active id can name different
  // folders, so the snapshot is cached under the id only when the session reports it for that
  // folder's stored path (a snapshot's own root is the resolved path, which can differ).
  const activePath = activeVaultId ? vaults.find((vault) => vault.id === activeVaultId)?.path ?? null : null;
  useEffect(() => {
    if (enabled && activeSnapshot && activeVaultId && activePath && activeSnapshotPath === activePath) {
      queryClient.setQueryData(getLocalVaultVaultSnapshotQueryKey(activeVaultId), activeSnapshot);
    }
  }, [activePath, activeSnapshot, activeSnapshotPath, activeVaultId, enabled, queryClient]);

  const folders = useMemo(
    () => vaultIds
      .map((vaultId) => vaults.find((vault) => vault.id === vaultId))
      .filter((vault): vault is { id: string; path: string } => Boolean(vault)),
    [vaultIds, vaults],
  );
  const results = useQueries({
    queries: folders.map((vault) => ({
      queryKey: getLocalVaultVaultSnapshotQueryKey(vault.id),
      networkMode: 'always' as const,
      queryFn: async (): Promise<LocalVaultSnapshot> => {
        if (!api) throw new Error('Electron API is unavailable.');
        return api.localVault.getVaultSnapshot({ vaultId: vault.id });
      },
      // The active folder reads through the session; scanning it twice would only cost time.
      enabled: enabled && !!api && vault.id !== activeVaultId,
      placeholderData: keepPreviousData,
      staleTime: 10_000,
      retry: 1,
    })),
  });

  // The query results array is new on every render, but its state is not. Rebuild the trees only
  // when a scan changes, so typing in the editor does not rebuild the sidebar.
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const resultsSignature = results.map((result) => (
    `${result?.dataUpdatedAt ?? 0}:${result?.status ?? ''}:${result?.fetchStatus ?? ''}:${result?.error instanceof Error ? result.error.message : ''}`
  )).join('|');
  return useMemo(() => folders.map((vault, index) => {
    const active = vault.id === activeVaultId;
    const result = resultsRef.current[index];
    const snapshot = active ? null : result?.data ?? null;
    const { folders: snapshotFolders, notes } = adaptLocalVaultSnapshot(snapshot, showHidden);
    return {
      id: vault.id,
      label: localVaultFolderName(vault.path),
      path: vault.path,
      active,
      snapshotVaultId: active ? activeSnapshot?.vaultId ?? null : snapshot?.vaultId ?? null,
      snapshot,
      tree: snapshot ? buildHackmdFolderTree(notes, snapshotFolders) : EMPTY_TREE,
      isLoading: !active && !snapshot && !!result && result.fetchStatus !== 'idle',
      // A failed refresh keeps the last good tree instead of replacing it with an error.
      error: !active && !snapshot && result?.error instanceof Error ? result.error.message : null,
    };
  }), [activeSnapshot?.vaultId, activeVaultId, folders, resultsSignature, showHidden]);
}
