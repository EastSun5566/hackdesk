import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalVaultSessionApi } from './useLocalVaultSession';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { defaultSettings, getActiveLocalVaultPath } from '@/lib/settings';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { getLocalVaultSnapshotQueryKey } from './useElectronLocalVault';
import type { WorkspaceScope } from './types';
import { useHomeLocalVaultActions } from './useHomeLocalVaultActions';

const { toastErrorMock, toastSuccessMock, confirmDialogMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  confirmDialogMock: vi.fn(),
}));

vi.mock('@/components/ConfirmDialogHost', () => ({
  confirmDialog: confirmDialogMock,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

function safeSettings(overrides: Partial<ElectronSafeSettings> = {}): ElectronSafeSettings {
  return {
    title: 'HackDesk',
    workspaceNavigation: defaultSettings.workspaceNavigation,
    appearance: defaultSettings.appearance,
    editor: defaultSettings.editor,
    hasHackmdApiToken: false,
    hackmdAccounts: { accounts: [], activeAccountId: null },
    hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    hasLocalVault: true,
    localVault: { vaults: [{ id: 'vault-notes', path: '/Users/michael/Notes' }], activeVaultId: 'vault-notes', workspaces: [], activeWorkspaceId: null },
    onboarding: defaultSettings.onboarding,
    shouldShowHackmdOnboarding: false,
    ...overrides,
  };
}

function snapshot(overrides: Partial<LocalVaultSnapshot> = {}): LocalVaultSnapshot {
  return {
    vaultId: 'vault-1',
    rootPath: '/Users/michael/Notes',
    folders: [],
    notes: [],
    ...overrides,
  };
}

function createApi(overrides: {
  choose?: HackDeskElectronAPI['localVault']['choose'];
  disconnect?: HackDeskElectronAPI['localVault']['disconnect'];
} = {}): LocalVaultSessionApi {
  return {
    getRuntimeEnvironment: () => 'electron',
    platform: 'darwin',
    settings: {
      get: vi.fn(),
      update: vi.fn(async () => safeSettings()),
      importHackmdCliToken: vi.fn(),
    },
    hackmd: {} as HackDeskElectronAPI['hackmd'],
    localVault: {
      choose: overrides.choose ?? vi.fn(async () => ({ canceled: true })),
      disconnect: overrides.disconnect ?? vi.fn(async () => safeSettings({ localVault: { vaults: [], activeVaultId: null, workspaces: [], activeWorkspaceId: null }, hasLocalVault: false })),
      activate: vi.fn(async () => ({ settings: safeSettings(), snapshot: snapshot() })),
      forget: vi.fn(async () => ({ settings: safeSettings({ localVault: { vaults: [], activeVaultId: null, workspaces: [], activeWorkspaceId: null }, hasLocalVault: false }), snapshot: null })),
      switchVault: vi.fn(async () => ({ settings: safeSettings(), snapshot: snapshot() })),
      updateWorkspace: vi.fn(async () => ({ settings: safeSettings(), snapshot: snapshot() })),
      forgetVault: vi.fn(async () => ({ settings: safeSettings({ localVault: { vaults: [], activeVaultId: null, workspaces: [], activeWorkspaceId: null }, hasLocalVault: false }), snapshot: null })),
      getSnapshot: vi.fn(),
      readNote: vi.fn(),
      createNote: vi.fn(),
      writeNote: vi.fn(),
      renameNote: vi.fn(),
      moveNote: vi.fn(),
      trashNote: vi.fn(),
      revealNote: vi.fn(async () => undefined),
      importAttachment: vi.fn(),
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      moveFolder: vi.fn(),
      trashFolder: vi.fn(),
      revealFolder: vi.fn(async () => undefined),
      revealRoot: vi.fn(async () => undefined),
      browse: vi.fn(async () => ({ path: '/tmp', parent: '/', home: '/tmp', entries: [] })),
      choosePath: vi.fn(async () => ({ canceled: true })),
      createDirectory: vi.fn(async () => ({ path: '/tmp/new' })),
      onDidChange: vi.fn(),
    },
    shell: {} as HackDeskElectronAPI['shell'],
    app: {
      confirm: vi.fn(async () => ({ confirmed: false })),
      exportDebugLogs: vi.fn(),
      recordFatalRendererError: vi.fn(),
      writeClipboardText: vi.fn(),
      saveTextFile: vi.fn(),
      openTextFile: vi.fn(),
      onCommand: vi.fn(),
      onCloseRequest: vi.fn(),
      confirmClose: vi.fn(),
      cancelClose: vi.fn(),
      checkForUpdates: vi.fn(),
      setThemeSurface: vi.fn(),
      newWindow: vi.fn(),
    },
  } as unknown as LocalVaultSessionApi;
}

function renderLocalVaultActions(api: LocalVaultSessionApi, queryClient = new QueryClient(), scopeType?: WorkspaceScope['type']) {
  const setWorkspaceScope = vi.fn();
  const refetchLocalVault = vi.fn(async () => undefined);
  const result = renderHook(() => useHomeLocalVaultActions({
    api,
    queryClient,
    refetchLocalVault,
    scopeType,
    setWorkspaceScope,
  }));

  return {
    ...result,
    queryClient,
    refetchLocalVault,
    setWorkspaceScope,
  };
}

describe('useHomeLocalVaultActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmDialogMock.mockResolvedValue({ confirmed: false });
  });

  it('chooses a local vault, updates cache, and switches to local scope', async () => {
    const nextSettings = safeSettings();
    const nextSnapshot = snapshot();
    const api = createApi({
      choose: vi.fn(async () => ({
        canceled: false,
        settings: nextSettings,
        snapshot: nextSnapshot,
      })),
    });
    const { queryClient, result, setWorkspaceScope } = renderLocalVaultActions(api);

    await act(async () => {
      await result.current.chooseLocalVault();
    });

    expect(api.localVault.choose).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(['electron', 'settings'])).toBe(nextSettings);
    expect(queryClient.getQueryData(getLocalVaultSnapshotQueryKey(getActiveLocalVaultPath(nextSettings)))).toBe(nextSnapshot);
    expect(setWorkspaceScope).toHaveBeenCalledWith({ type: 'local', label: 'Notes', vaultId: nextSnapshot.vaultId });
  });

  it('does not switch scope when local vault choosing is canceled', async () => {
    const api = createApi({
      choose: vi.fn(async () => ({ canceled: true })),
    });
    const { queryClient, result, setWorkspaceScope } = renderLocalVaultActions(api);

    await act(async () => {
      await result.current.chooseLocalVault();
    });

    expect(setWorkspaceScope).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['electron', 'settings'])).toBeUndefined();
    expect(queryClient.getQueryData(getLocalVaultSnapshotQueryKey())).toBeUndefined();
  });

  it('opens and reveals local vault paths through the Electron API', async () => {
    const api = createApi();
    const { result } = renderLocalVaultActions(api);

    await act(async () => {
      await result.current.openLocalVault();
    });
    result.current.revealLocalNote({ id: 'note-1', teamPath: LOCAL_VAULT_TEAM_PATH });
    result.current.revealLocalFolder('local-folder:Projects/Archive');
    result.current.revealLocalNote({ id: 'remote-note', teamPath: null });
    result.current.revealLocalFolder('remote-folder');

    expect(api.localVault.revealRoot).toHaveBeenCalledOnce();
    expect(api.localVault.revealNote).toHaveBeenCalledWith({ noteId: 'note-1' });
    expect(api.localVault.revealFolder).toHaveBeenCalledWith({ relativePath: 'Projects/Archive' });
    expect(api.localVault.revealNote).toHaveBeenCalledTimes(1);
    expect(api.localVault.revealFolder).toHaveBeenCalledTimes(1);
  });

  it('forgets the local vault only after confirmation', async () => {
    confirmDialogMock.mockResolvedValue({ confirmed: true });
    const nextSettings = safeSettings({ localVault: { vaults: [], activeVaultId: null, workspaces: [], activeWorkspaceId: null }, hasLocalVault: false });
    const api = createApi({
      disconnect: vi.fn(async () => nextSettings),
    });
    const queryClient = new QueryClient();
    queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), snapshot());
    const { result } = renderLocalVaultActions(api, queryClient);

    await act(async () => {
      await result.current.forgetLocalVault();
    });

    expect(confirmDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Forget Local Vault',
      confirmLabel: 'Forget Vault',
      destructive: true,
    }));
    expect(api.localVault.disconnect).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(['electron', 'settings'])).toBe(nextSettings);
    expect(queryClient.getQueryData(getLocalVaultSnapshotQueryKey())).toBeNull();
    expect(toastSuccessMock).toHaveBeenCalledWith('Local vault forgotten.', {
      description: 'Markdown files were not deleted.',
    });
  });

  it('creates a working set and opens it', async () => {
    const api = createApi();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['electron', 'settings'], safeSettings());
    const { result, setWorkspaceScope } = renderLocalVaultActions(api, queryClient);

    await act(async () => {
      await result.current.createLocalWorkspace('Work', ['vault-notes']);
    });

    expect(api.localVault.updateWorkspace).toHaveBeenCalledOnce();
    expect(api.localVault.updateWorkspace).toHaveBeenCalledWith({ type: 'create', name: 'Work', vaultIds: ['vault-notes'] });
    expect(setWorkspaceScope).toHaveBeenCalled();
  });

  it('renames, re-scopes and deletes working sets through the session api', async () => {
    const api = createApi();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['electron', 'settings'], safeSettings());
    const { result } = renderLocalVaultActions(api, queryClient);

    await act(async () => {
      await result.current.renameLocalWorkspace('workspace-work', 'Studio');
      await result.current.setLocalWorkspaceFolders('workspace-work', ['vault-notes']);
      await result.current.deleteLocalWorkspace('workspace-work');
      await result.current.activateLocalWorkspace(null);
    });

    expect(api.localVault.updateWorkspace).toHaveBeenCalledWith({ type: 'rename', id: 'workspace-work', name: 'Studio' });
    expect(api.localVault.updateWorkspace).toHaveBeenCalledWith({ type: 'setVaults', id: 'workspace-work', vaultIds: ['vault-notes'] });
    expect(api.localVault.updateWorkspace).toHaveBeenCalledWith({ type: 'delete', id: 'workspace-work' });
    expect(api.localVault.updateWorkspace).toHaveBeenCalledWith({ type: 'activate', id: null });
  });

  it('leaves another workspace alone when a set is renamed from it', async () => {
    const api = createApi();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['electron', 'settings'], safeSettings());
    const { result, setWorkspaceScope } = renderLocalVaultActions(api, queryClient, 'team');

    await act(async () => {
      await result.current.renameLocalWorkspace('workspace-work', 'Studio');
      await result.current.deleteLocalWorkspace('workspace-work');
    });

    expect(api.localVault.updateWorkspace).toHaveBeenCalledTimes(2);
    expect(setWorkspaceScope).not.toHaveBeenCalled();
  });

  it('switches to another vault and updates the scope', async () => {
    const api = createApi();
    const queryClient = new QueryClient();
    const { result, setWorkspaceScope } = renderLocalVaultActions(api, queryClient);

    await act(async () => {
      await result.current.switchLocalVault('vault-notes');
    });

    expect(api.localVault.switchVault).toHaveBeenCalledWith('vault-notes');
    expect(setWorkspaceScope).toHaveBeenCalledWith({ type: 'local', label: 'Notes', vaultId: 'vault-1' });
  });

  it('forgets a single vault by id after confirmation', async () => {
    confirmDialogMock.mockResolvedValue({ confirmed: true });
    const api = createApi();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['electron', 'settings'], safeSettings());
    const { result, setWorkspaceScope } = renderLocalVaultActions(api, queryClient);

    await act(async () => {
      await result.current.forgetLocalVault('vault-notes');
    });

    expect(confirmDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Forget Local Vault',
    }));
    expect(api.localVault.forgetVault).toHaveBeenCalledWith('vault-notes');
    // Forgetting the active vault re-scopes onto the fallback (here: none left).
    expect(setWorkspaceScope).toHaveBeenCalledWith({ type: 'local', label: 'Local Vault', vaultId: undefined });
    expect(toastSuccessMock).toHaveBeenCalledWith('Local vault forgotten.', {
      description: 'Markdown files were not deleted.',
    });
  });

  it('does not forget the local vault when confirmation is canceled', async () => {
    const api = createApi();
    const { result } = renderLocalVaultActions(api);

    await act(async () => {
      await result.current.forgetLocalVault();
    });

    expect(api.settings.update).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('refreshes the local vault through the provided refetch callback', async () => {
    const api = createApi();
    const { refetchLocalVault, result } = renderLocalVaultActions(api);

    await act(async () => {
      await result.current.refreshLocalVault();
    });

    expect(refetchLocalVault).toHaveBeenCalledOnce();
  });

  it('reports reveal failures through toast without throwing', async () => {
    const api = createApi();
    vi.mocked(api.localVault.revealNote).mockRejectedValueOnce(new Error('Missing file'));
    const { result } = renderLocalVaultActions(api);

    result.current.revealLocalNote({ id: 'note-1', teamPath: LOCAL_VAULT_TEAM_PATH });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Missing file');
    });
  });
});
