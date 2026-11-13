import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getHackDeskAPI,
  getRuntimeEnvironment,
  normalizeSafeSettings,
  type ElectronSafeSettings,
  type HackDeskElectronAPI,
  type HackDeskQuickCaptureAPI,
} from './electron-api';

describe('Electron API runtime detection', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
    delete window.hackdeskQuickCaptureAPI;
  });

  it('detects Electron from the minimal Quick Hack preload', () => {
    window.hackdeskQuickCaptureAPI = {} as HackDeskQuickCaptureAPI;

    expect(getRuntimeEnvironment()).toBe('electron');
  });

  it('detects Electron when preload exposed hackdeskAPI', () => {
    window.hackdeskAPI = { getRuntimeEnvironment: () => 'electron' } as HackDeskElectronAPI;

    expect(getRuntimeEnvironment()).toBe('electron');
  });

  it('falls back to web outside desktop runtimes', () => {
    expect(getRuntimeEnvironment()).toBe('web');
  });
});

/** Settings as an older main process can send them: the local-vault section without its lists. */
const OLD_SHAPE = { hasLocalVault: true, localVault: { path: '/vault' } } as unknown as ElectronSafeSettings;
const COMPLETE_LOCAL_VAULT = { vaults: [], activeVaultId: null, workspaces: [], activeWorkspaceId: null };

describe('settings entering the renderer', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('fills in a local-vault section that lacks its lists, and leaves complete settings as they are', () => {
    expect(normalizeSafeSettings(OLD_SHAPE).localVault).toEqual(COMPLETE_LOCAL_VAULT);
    const complete = { hasLocalVault: false, localVault: { ...COMPLETE_LOCAL_VAULT, vaults: [{ id: 'a', path: '/a' }] } } as unknown as ElectronSafeSettings;
    expect(normalizeSafeSettings(complete)).toBe(complete);
    expect(normalizeSafeSettings({ hasLocalVault: false } as unknown as ElectronSafeSettings).localVault).toEqual(COMPLETE_LOCAL_VAULT);
  });

  it('normalizes every call that returns settings, and keeps one wrapper per API', async () => {
    const snapshot = { vaultId: 'a' };
    window.hackdeskAPI = {
      platform: 'linux',
      settings: {
        get: vi.fn(async () => OLD_SHAPE),
        update: vi.fn(async () => OLD_SHAPE),
        importHackmdCliToken: vi.fn(async () => ({ settings: OLD_SHAPE, user: { id: 'u' } })),
      },
      localVault: {
        choose: vi.fn(async () => ({ canceled: true })),
        choosePath: vi.fn(async () => ({ canceled: false, settings: OLD_SHAPE, snapshot })),
        activate: vi.fn(async () => ({ settings: OLD_SHAPE, snapshot })),
        forget: vi.fn(async () => ({ settings: OLD_SHAPE, snapshot: null })),
        updateWorkspace: vi.fn(async () => ({ settings: OLD_SHAPE, snapshot: null })),
        disconnect: vi.fn(async () => OLD_SHAPE),
        readNote: vi.fn(),
      },
    } as unknown as HackDeskElectronAPI;
    const api = getHackDeskAPI()!;
    expect(getHackDeskAPI()).toBe(api);
    expect(api.platform).toBe('linux');
    expect(api.localVault.readNote).toBe(window.hackdeskAPI.localVault.readNote);

    expect((await api.settings.get()).localVault).toEqual(COMPLETE_LOCAL_VAULT);
    expect((await api.settings.update({})).localVault).toEqual(COMPLETE_LOCAL_VAULT);
    expect((await api.settings.importHackmdCliToken()).settings.localVault).toEqual(COMPLETE_LOCAL_VAULT);
    expect(await api.localVault.choose()).toEqual({ canceled: true });
    const chosen = await api.localVault.choosePath({ path: '/a' });
    expect(chosen.settings?.localVault).toEqual(COMPLETE_LOCAL_VAULT);
    expect(chosen.snapshot).toBe(snapshot);
    for (const result of [
      await api.localVault.activate({ vaultId: 'a' }),
      await api.localVault.forget({ vaultId: 'a' }),
      await api.localVault.updateWorkspace({ type: 'activate', workspaceId: null } as never),
    ]) {
      expect(result.settings.localVault).toEqual(COMPLETE_LOCAL_VAULT);
    }
    expect((await api.localVault.disconnect()).localVault).toEqual(COMPLETE_LOCAL_VAULT);
  });
});
