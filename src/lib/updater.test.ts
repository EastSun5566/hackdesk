import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronApiMocks = vi.hoisted(() => ({
  getRuntimeEnvironment: vi.fn(),
  getHackDeskAPI: vi.fn(),
}));

vi.mock('./electron-api', () => ({
  getRuntimeEnvironment: electronApiMocks.getRuntimeEnvironment,
  getHackDeskAPI: electronApiMocks.getHackDeskAPI,
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
  });

  it('rejects update checks on the web runtime', async () => {
    electronApiMocks.getRuntimeEnvironment.mockReturnValue('web');

    await expect(checkForUpdatesForRuntime()).rejects.toThrow('desktop app');
  });
});
