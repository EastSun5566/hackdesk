import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalDocument, LocalVaultSnapshot } from '@/lib/local-vault';

import {
  getLocalVaultDocumentQueryKey,
  getLocalVaultSnapshotQueryKey,
  getLocalVaultVaultSnapshotQueryKey,
} from './local-vault-query';
import { useElectronLocalVault } from './useElectronLocalVault';
import { useWorkspaceFolderTrees } from './useWorkspaceFolderTrees';

// What happens when a folder's snapshot lands, for a named set {A, B} with A open. Characterization
// for #385 P2: it holds whether the work runs in render-time effects or where snapshots arrive.

const note = (id: string, relativePath: string): LocalVaultSnapshot['notes'][number] => ({
  id, title: id, relativePath, parentPath: null, createdAtMillis: null, updatedAtMillis: 1,
  revision: { contentHash: 'hash', mtimeMs: 1 },
});
const doc = (id: string, relativePath: string): LocalDocument => ({
  ...note(id, relativePath), content: 'Body', createdAtMillis: 1,
});
const folderA = (path = 'Old.md'): LocalVaultSnapshot => ({ vaultId: 'manifest-a', rootPath: '/A', folders: [], notes: [note('n1', path)] });
const folderB = (path = 'Old.md'): LocalVaultSnapshot => ({ vaultId: 'manifest-b', rootPath: '/B', folders: [], notes: [note('m1', path)] });

const VAULTS = [{ id: 'vault-a', path: '/A' }, { id: 'vault-b', path: '/B' }];
const settings = (activeVaultId: string) => ({
  localVault: { vaults: VAULTS, activeVaultId, workspaces: [], activeWorkspaceId: 'set' },
}) as unknown as ElectronSafeSettings;

/** Mounts the snapshot consumers as Home does, reading what they are given from the query cache. */
function Harness({ api, sessionPath }: { api: HackDeskElectronAPI; sessionPath: string }) {
  const read = { queryFn: () => Promise.reject(new Error('read from the cache only')), enabled: false } as const;
  const { data: current } = useQuery<ElectronSafeSettings>({ queryKey: ['electron', 'settings'], ...read });
  const { data: session = null } = useQuery<LocalVaultSnapshot | null>({ queryKey: getLocalVaultSnapshotQueryKey(sessionPath), ...read });
  const folders = useWorkspaceFolderTrees({
    api,
    activeSnapshot: session,
    activeSnapshotPath: sessionPath,
    activeVaultId: current?.localVault.activeVaultId ?? null,
    enabled: true,
    vaultIds: VAULTS.map((vault) => vault.id),
    vaults: VAULTS,
  });
  const workspaceSnapshots = useMemo(() => folders.flatMap((folder) => (folder.snapshot ? [folder.snapshot] : [])), [folders]);
  useElectronLocalVault({ api, enabled: !!session, snapshot: session, workspaceSnapshots, selectedNote: null, activeDocumentNotes: [] });
  return null;
}

function setup(activeVaultId = 'vault-a') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let other = folderB();
  const api = { localVault: { getVaultSnapshot: vi.fn(async () => other) } } as unknown as HackDeskElectronAPI;
  client.setQueryData(['electron', 'settings'], settings(activeVaultId));
  const mount = (sessionPath = '/A') => render(
    <QueryClientProvider client={client}><Harness api={api} sessionPath={sessionPath} /></QueryClientProvider>,
  );
  return { client, mount, setOther: (next: LocalVaultSnapshot) => { other = next; } };
}

describe('a folder snapshot landing', () => {
  it("re-reads an open folder's note that moved", async () => {
    const { client, mount } = setup();
    const key = getLocalVaultDocumentQueryKey('n1', 'manifest-a');
    client.setQueryData(getLocalVaultSnapshotQueryKey('/A'), folderA());
    client.setQueryData(key, doc('n1', 'Old.md'));
    mount();

    act(() => { client.setQueryData(getLocalVaultSnapshotQueryKey('/A'), folderA('Moved.md')); });
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  });

  it("re-reads a note of another folder of the set that moved, when that folder's snapshot refreshes", async () => {
    const { client, mount } = setup();
    const key = getLocalVaultDocumentQueryKey('m1', 'manifest-b');
    client.setQueryData(getLocalVaultSnapshotQueryKey('/A'), folderA());
    client.setQueryData(key, doc('m1', 'Old.md'));
    mount();
    await waitFor(() => expect(client.getQueryData(getLocalVaultVaultSnapshotQueryKey('vault-b'))).toEqual(folderB()));
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);

    act(() => { client.setQueryData(getLocalVaultVaultSnapshotQueryKey('vault-b'), folderB('Moved.md')); });
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  });

  it("keeps the open folder's snapshot under its stored id, so it shows at once when another folder opens", async () => {
    const { client, mount } = setup();
    client.setQueryData(getLocalVaultSnapshotQueryKey('/A'), folderA());
    mount();
    await waitFor(() => expect(client.getQueryData(getLocalVaultVaultSnapshotQueryKey('vault-a'))).toEqual(folderA()));

    act(() => { client.setQueryData(getLocalVaultSnapshotQueryKey('/A'), folderA('Moved.md')); });
    await waitFor(() => expect(client.getQueryData(getLocalVaultVaultSnapshotQueryKey('vault-a'))).toEqual(folderA('Moved.md')));
  });

  it('never files the session snapshot under a folder it does not belong to while another opens', async () => {
    // B is opening: the stored active id already names B, but the session still holds A's scan.
    const { client, mount } = setup('vault-b');
    client.setQueryData(getLocalVaultSnapshotQueryKey('/A'), folderA());
    mount('/A');
    await act(async () => { await Promise.resolve(); });
    expect(client.getQueryData<LocalVaultSnapshot>(getLocalVaultVaultSnapshotQueryKey('vault-b'))?.vaultId).not.toBe('manifest-a');
  });
});
