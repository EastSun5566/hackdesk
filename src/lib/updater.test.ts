import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronApiMocks = vi.hoisted(() => ({
  getRuntimeEnvironment: vi.fn(),
  getHackDeskAPI: vi.fn(),
}));

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('./electron-api', () => ({
  getRuntimeEnvironment: electronApiMocks.getRuntimeEnvironment,
  getHackDeskAPI: electronApiMocks.getHackDeskAPI,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriMocks.invoke,
}));

import { checkForUpdatesForRuntime } from './updater';

describe('checkForUpdatesForRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the Electron preload API inside Electron', async () => {
    const result = { status: 'upToDate' };
    const checkForUpdates = vi.fn().mockResolvedValue(result);
    electronApiMocks.getRuntimeEnvironment.mockReturnValue('electron');
    electronApiMocks.getHackDeskAPI.mockReturnValue({
      app: {
        checkForUpdates,
      },
    });

    await expect(checkForUpdatesForRuntime()).resolves.toEqual(result);

    expect(checkForUpdates).toHaveBeenCalled();
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it('uses the Tauri updater command inside Tauri', async () => {
    const result = { status: 'declined', version: '0.2.0' };
    electronApiMocks.getRuntimeEnvironment.mockReturnValue('tauri');
    tauriMocks.invoke.mockResolvedValue(result);

    await expect(checkForUpdatesForRuntime()).resolves.toEqual(result);

    expect(tauriMocks.invoke).toHaveBeenCalledWith('check_for_updates');
  });

  it('rejects update checks on the web runtime', async () => {
    electronApiMocks.getRuntimeEnvironment.mockReturnValue('web');

    await expect(checkForUpdatesForRuntime()).rejects.toThrow('desktop app');
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });
});
