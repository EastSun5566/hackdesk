import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { defaultSettings } from '@/lib/settings';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { getLocalVaultSnapshotQueryKey } from './useElectronLocalVault';
import { useHomeLocalVaultActions } from './useHomeLocalVaultActions';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
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
    appearance: defaultSettings.appearance,
    editor: defaultSettings.editor,
    hasHackmdApiToken: false,
    hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    hasLocalVault: true,
    localVault: { path: '/Users/michael/Notes' },
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
  confirm?: HackDeskElectronAPI['app']['confirm'];
  settingsUpdate?: HackDeskElectronAPI['settings']['update'];
} = {}): HackDeskElectronAPI {
  return {
    getRuntimeEnvironment: () => 'electron',
    platform: 'darwin',
    settings: {
      get: vi.fn(),
      update: overrides.settingsUpdate ?? vi.fn(async (input) => safeSettings(input.localVault ? { localVault: input.localVault } : undefined)),
      importHackmdCliToken: vi.fn(),
    },
    hackmd: {} as HackDeskElectronAPI['hackmd'],
    localVault: {
      choose: overrides.choose ?? vi.fn(async () => ({ canceled: true })),
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
      onDidChange: vi.fn(),
    },
    shell: {} as HackDeskElectronAPI['shell'],
    app: {
      confirm: overrides.confirm ?? vi.fn(async () => ({ confirmed: false })),
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
    },
  } as HackDeskElectronAPI;
}

function renderLocalVaultActions(api: HackDeskElectronAPI, queryClient = new QueryClient()) {
  const setWorkspaceScope = vi.fn();
  const refetchLocalVault = vi.fn(async () => undefined);
  const result = renderHook(() => useHomeLocalVaultActions({
    api,
    queryClient,
    refetchLocalVault,
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
    expect(queryClient.getQueryData(getLocalVaultSnapshotQueryKey())).toBe(nextSnapshot);
    expect(setWorkspaceScope).toHaveBeenCalledWith({ type: 'local', label: 'Local Vault' });
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
    const nextSettings = safeSettings({ localVault: { path: null }, hasLocalVault: false });
    const api = createApi({
      confirm: vi.fn(async () => ({ confirmed: true })),
      settingsUpdate: vi.fn(async () => nextSettings),
    });
    const queryClient = new QueryClient();
    queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), snapshot());
    const { result } = renderLocalVaultActions(api, queryClient);

    await act(async () => {
      await result.current.forgetLocalVault();
    });

    expect(api.app.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Forget Local Vault',
      confirmLabel: 'Forget Vault',
      destructive: true,
    }));
    expect(api.settings.update).toHaveBeenCalledWith({ localVault: { path: null } });
    expect(queryClient.getQueryData(['electron', 'settings'])).toBe(nextSettings);
    expect(queryClient.getQueryData(getLocalVaultSnapshotQueryKey())).toBeNull();
    expect(toastSuccessMock).toHaveBeenCalledWith('Local vault forgotten. Your files were not deleted.');
  });

  it('does not forget the local vault when confirmation is canceled', async () => {
    const api = createApi({
      confirm: vi.fn(async () => ({ confirmed: false })),
    });
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
