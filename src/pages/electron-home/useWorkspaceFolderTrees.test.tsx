import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';

import { getLocalVaultVaultSnapshotQueryKey } from './local-vault-query';
import { useWorkspaceFolderTrees } from './useWorkspaceFolderTrees';

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const snapshot: LocalVaultSnapshot = {
  vaultId: 'snapshot-b',
  rootPath: '/Users/michael/B',
  notes: [{
    id: 'note-b',
    title: 'B note',
    relativePath: 'B note.md',
    parentPath: null,
    createdAtMillis: null,
    updatedAtMillis: 1,
    revision: { contentHash: 'hash', mtimeMs: 1 },
  }],
  folders: [],
};

function apiWithSnapshot(getVaultSnapshot = vi.fn(async () => snapshot)) {
  return {
    localVault: { getVaultSnapshot },
  } as unknown as HackDeskElectronAPI;
}

describe('useWorkspaceFolderTrees', () => {
  it("caches the open folder's snapshot only under the folder it came from", () => {
    const client = createClient();
    // While B opens, the stored active id already names B but the session still holds A's scan.
    const folderA: LocalVaultSnapshot = { ...snapshot, vaultId: 'snapshot-a', rootPath: '/Users/michael/A' };
    renderHook(
      () => useWorkspaceFolderTrees({
        api: apiWithSnapshot(),
        activeSnapshot: folderA,
        activeSnapshotPath: '/Users/michael/A',
        activeVaultId: 'vault-b',
        enabled: true,
        vaultIds: ['vault-a', 'vault-b'],
        vaults: [
          { id: 'vault-a', path: '/Users/michael/A' },
          { id: 'vault-b', path: '/Users/michael/B' },
        ],
      }),
      { wrapper: wrapper(client) },
    );

    expect(client.getQueryData(getLocalVaultVaultSnapshotQueryKey('vault-b'))).toBeUndefined();
  });

  it('caches the open folder under its stored path even when the scan reports the resolved one', () => {
    const client = createClient();
    // macOS resolves /var to /private/var; Windows can resolve short names and letter case.
    const resolved: LocalVaultSnapshot = { ...snapshot, rootPath: '/private/var/B' };
    renderHook(
      () => useWorkspaceFolderTrees({
        api: apiWithSnapshot(),
        activeSnapshot: resolved,
        activeSnapshotPath: '/var/B',
        activeVaultId: 'vault-b',
        enabled: true,
        vaultIds: ['vault-a', 'vault-b'],
        vaults: [
          { id: 'vault-a', path: '/var/A' },
          { id: 'vault-b', path: '/var/B' },
        ],
      }),
      { wrapper: wrapper(client) },
    );

    expect(client.getQueryData(getLocalVaultVaultSnapshotQueryKey('vault-b'))).toEqual(resolved);
  });

  it('loads every other folder in the set and builds its tree', async () => {
    const getVaultSnapshot = vi.fn(async () => snapshot);
    const { result } = renderHook(
      () => useWorkspaceFolderTrees({
        api: apiWithSnapshot(getVaultSnapshot),
        activeSnapshot: null,
        activeSnapshotPath: null,
        activeVaultId: 'vault-a',
        enabled: true,
        vaultIds: ['vault-a', 'vault-b'],
        vaults: [
          { id: 'vault-a', path: '/Users/michael/A' },
          { id: 'vault-b', path: '/Users/michael/B' },
        ],
      }),
      { wrapper: wrapper(createClient()) },
    );

    await waitFor(() => expect(result.current[1]?.tree.allNotes).toHaveLength(1));

    // The open folder is read through the session, never scanned a second time.
    expect(getVaultSnapshot).toHaveBeenCalledOnce();
    expect(getVaultSnapshot).toHaveBeenCalledWith({ vaultId: 'vault-b' });
    expect(result.current).toMatchObject([
      { id: 'vault-a', label: 'A', active: true },
      { id: 'vault-b', label: 'B', active: false, error: null },
    ]);
    expect(result.current[1].tree.allNotes[0].note.title).toBe('B note');
  });

  it('shows the folder that was just open without scanning it again', async () => {
    const getVaultSnapshot = vi.fn(async () => snapshot);
    const client = createClient();
    const vaults = [
      { id: 'vault-a', path: '/Users/michael/A' },
      // Stored ids differ from the manifest id a scan reports ('snapshot-b').
      { id: 'vault-b', path: '/Users/michael/B' },
    ];
    const { result, rerender } = renderHook(
      ({ activeVaultId, activeSnapshot }: { activeVaultId: string; activeSnapshot: LocalVaultSnapshot | null }) => useWorkspaceFolderTrees({
        api: apiWithSnapshot(getVaultSnapshot),
        activeSnapshot,
        activeSnapshotPath: activeSnapshot ? vaults.find((vault) => vault.id === activeVaultId)!.path : null,
        activeVaultId,
        enabled: true,
        vaultIds: ['vault-a', 'vault-b'],
        vaults,
      }),
      {
        initialProps: { activeVaultId: 'vault-b', activeSnapshot: snapshot as LocalVaultSnapshot | null },
        wrapper: wrapper(client),
      },
    );
    await waitFor(() => expect(getVaultSnapshot).toHaveBeenCalledWith({ vaultId: 'vault-a' }));
    getVaultSnapshot.mockClear();

    // Opening A turns B into a preview, already filled from the session's last snapshot.
    rerender({ activeVaultId: 'vault-a', activeSnapshot: null });

    expect(result.current.map((folder) => folder.id)).toEqual(['vault-a', 'vault-b']);
    expect(result.current[1]).toMatchObject({ active: false, isLoading: false });
    expect(result.current[1].tree.allNotes).toHaveLength(1);
    expect(getVaultSnapshot).not.toHaveBeenCalled();
  });

  it('does not scan folders while the workspace is closed', () => {
    const getVaultSnapshot = vi.fn(async () => snapshot);
    renderHook(
      () => useWorkspaceFolderTrees({
        api: apiWithSnapshot(getVaultSnapshot),
        activeSnapshot: null,
        activeSnapshotPath: null,
        activeVaultId: 'vault-a',
        enabled: false,
        vaultIds: ['vault-a', 'vault-b'],
        vaults: [
          { id: 'vault-a', path: '/Users/michael/A' },
          { id: 'vault-b', path: '/Users/michael/B' },
        ],
      }),
      { wrapper: wrapper(createClient()) },
    );

    expect(getVaultSnapshot).not.toHaveBeenCalled();
  });
});
