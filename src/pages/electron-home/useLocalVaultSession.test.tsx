import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { defaultSettings } from '@/lib/settings';
import { useLocalVaultSession } from './useLocalVaultSession';
import { useElectronSettings } from './useElectronSettings';
import { useNoteWorkspaceTabs } from './useNoteWorkspaceTabs';
import { getLocalVaultDocumentQueryKey, getLocalVaultSnapshotQueryKey, guardLocalVaultApi, type VaultAccess } from './local-vault-query';

const snapshot = (id: string): LocalVaultSnapshot => ({ vaultId: id, rootPath: `/tmp/${id}`, folders: [], notes: [] });
const settings = (path: string | null): ElectronSafeSettings => ({
  ...defaultSettings, localVault: { path }, hasHackmdApiToken: false, hasLocalVault: !!path,
  hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false }, shouldShowHackmdOnboarding: false,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const changed = vi.fn();
  const api = {
    settings: { get: vi.fn(async () => settings('/tmp/A')) },
    localVault: {
      getSnapshot: vi.fn(async () => snapshot(client.getQueryData<ElectronSafeSettings>(['electron', 'settings'])?.localVault.path === '/tmp/B' ? 'B' : 'A')),
      choose: vi.fn(async () => ({ canceled: false, settings: settings('/tmp/B'), snapshot: snapshot('B') })),
      disconnect: vi.fn(async () => settings(null)),
      readNote: vi.fn(async () => ({ content: 'A' })),
      onDidChange: vi.fn((callback) => { changed.mockImplementation(callback); return () => {}; }),
    },
  } as unknown as HackDeskElectronAPI;
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  function useFixture() {
    const beforeChange = useRef(() => {});
    const currentSettings = useElectronSettings(api);
    const session = useLocalVaultSession(api, currentSettings.data, beforeChange);
    const tabs = useNoteWorkspaceTabs(session.vaultId ? `local:${session.vaultId}` : null);
    const flush = tabs.flush;
    useLayoutEffect(() => { beforeChange.current = flush; }, [flush]);
    return { session, tabs };
  }
  return { api, client, changed, ...renderHook(useFixture, { wrapper }) };
}
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('Local Vault session', () => {
  it('waits for snapshot identity and rejects operations before it is ready', async () => {
    const f = fixture();
    expect(f.result.current.session.vaultId).toBeNull();
    await expect(f.result.current.session.api!.localVault.readNote('note')).rejects.toThrow('still loading');
    expect(f.api.localVault.readNote).not.toHaveBeenCalled();
    await waitFor(() => expect(f.result.current.session.vaultId).toBe('A'));
  });

  it('flushes immediately, cancels old requests and ignores late responses and watcher events', async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.session.vaultId).toBe('A'));
    act(() => { f.result.current.tabs.openRecoverableDraftNote({ content: 'Last A input' }); });
    const delayed = deferred<Awaited<ReturnType<HackDeskElectronAPI['localVault']['readNote']>>>();
    vi.mocked(f.api.localVault.readNote).mockReturnValueOnce(delayed.promise);
    const oldApi = f.result.current.session.api!;
    const read = oldApi.localVault.readNote('same-note');
    const rejection = expect(read).rejects.toThrow('changed');
    const oldEvent = f.changed.getMockImplementation()!;
    await act(async () => { await f.result.current.session.api!.localVault.choose(); });
    await waitFor(() => expect(f.result.current.session.vaultId).toBe('B'));
    delayed.resolve({ content: 'late A' } as Awaited<ReturnType<HackDeskElectronAPI['localVault']['readNote']>>);
    await rejection;
    await expect(oldApi.localVault.readNote('same-note')).rejects.toThrow('still loading');
    act(() => { oldEvent({ snapshot: snapshot('A') }); });
    expect(f.result.current.session.vaultId).toBe('B');
    expect(f.client.getQueryData(getLocalVaultSnapshotQueryKey('/tmp/B'))).toEqual(snapshot('B'));
    expect(localStorage.getItem('hackdesk_note_workspace:local:A')).toContain('Last A input');
    expect(f.result.current.tabs.state.tabs).toEqual({});
    expect(getLocalVaultDocumentQueryKey('same-note', 'A')).not.toEqual(getLocalVaultDocumentQueryKey('same-note', 'B'));
  });

  it('keeps the workspace on cancel; blocks Quick Hack-style submission while choosing', async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.session.vaultId).toBe('A'));
    act(() => { f.result.current.tabs.openRecoverableDraftNote({ content: 'Keep A' }); });
    const state = f.result.current.tabs.state;
    const pending = deferred<Awaited<ReturnType<HackDeskElectronAPI['localVault']['choose']>>>();
    vi.mocked(f.api.localVault.choose).mockReturnValueOnce(pending.promise);
    let choice!: Promise<unknown>;
    act(() => { choice = f.result.current.session.api!.localVault.choose(); });
    await waitFor(() => expect(f.result.current.session.isChanging).toBe(true));
    expect(f.result.current.session.vaultId).toBe('A');
    await expect(f.result.current.session.api!.localVault.readNote('note')).rejects.toThrow('still loading');
    await act(async () => { pending.resolve({ canceled: true }); await choice; });
    expect(f.result.current.session.isChanging).toBe(false);
    expect(f.result.current.tabs.state).toEqual(state);
  });

  it('preserves saved workspace after Forget and reconnecting to the same vault', async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.session.vaultId).toBe('A'));
    act(() => { f.result.current.tabs.openRecoverableDraftNote({ content: 'Return to A' }); });
    await act(async () => { await f.result.current.session.api!.localVault.disconnect(); });
    await waitFor(() => expect(f.result.current.session.vaultId).toBeNull());
    vi.mocked(f.api.localVault.choose).mockResolvedValueOnce({ canceled: false, settings: settings('/tmp/A'), snapshot: snapshot('A') });
    await act(async () => { await f.result.current.session.api!.localVault.choose(); });
    await waitFor(() => expect(f.result.current.session.vaultId).toBe('A'));
    expect(Object.values(f.result.current.tabs.state.drafts)[0].content).toBe('Return to A');
  });

  it('keeps the Local workspace unresolved after a snapshot failure', async () => {
    const f = fixture();
    vi.mocked(f.api.localVault.getSnapshot).mockRejectedValue(new Error('Cannot scan vault'));
    await waitFor(() => expect(f.result.current.session.snapshotQuery.isError).toBe(true));
    expect(f.result.current.session.vaultId).toBeNull();
    expect(localStorage.getItem('hackdesk_note_workspace:local:A')).toBeNull();
  });

  it('ignores an old snapshot that arrives after switching to another vault', async () => {
    const f = fixture();
    const oldScan = deferred<LocalVaultSnapshot>();
    vi.mocked(f.api.localVault.getSnapshot).mockReturnValueOnce(oldScan.promise);
    await waitFor(() => expect(f.api.localVault.getSnapshot).toHaveBeenCalledOnce());
    expect(f.result.current.session.vaultId).toBeNull();
    await act(async () => { await f.result.current.session.api!.localVault.choose(); });
    await waitFor(() => expect(f.result.current.session.vaultId).toBe('B'));
    await act(async () => { oldScan.resolve(snapshot('A')); await oldScan.promise; });
    expect(f.result.current.session.vaultId).toBe('B');
    expect(f.client.getQueryData(getLocalVaultSnapshotQueryKey('/tmp/B'))).toEqual(snapshot('B'));
  });

  it('retries migration after freeing storage and refreshing an unchanged snapshot', async () => {
    const write = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'hackdesk_local_workspace_backup_v1') throw new Error('Storage full');
      write.call(this, key, value);
    });
    const f = fixture();
    await waitFor(() => expect(f.result.current.session.error).toContain('Free storage space'));
    expect(f.result.current.session.vaultId).toBeNull();
    spy.mockRestore();
    await act(async () => { await f.result.current.session.snapshotQuery.refetch(); });
    await waitFor(() => expect(f.result.current.session.vaultId).toBe('A'));
    expect(f.result.current.session.error).toBeNull();
  });

  it('rejects an operation that completes after A → B → A, even with the same vault ID', async () => {
    const pending = deferred<string>();
    const api = { localVault: { readNote: vi.fn(() => pending.promise) } } as unknown as HackDeskElectronAPI;
    const access: VaultAccess = { vaultId: 'A', generation: 1, changing: false };
    const guarded = guardLocalVaultApi(api, () => access);
    const operation = guarded.localVault.readNote('note');
    const rejection = expect(operation).rejects.toThrow('changed');
    access.generation = 3;
    pending.resolve('late A');
    await rejection;
  });
});
