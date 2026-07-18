import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '2.0.0'),
    isPackaged: true,
  },
  dialog: {
    showMessageBox: vi.fn(),
  },
}));

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {},
  },
}));

vi.mock('./logging', () => ({
  writeLog: vi.fn(),
}));

import { createUpdaterLogger, ElectronUpdaterService } from './app-updater';

function createUpdater() {
  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    autoRunAppAfterInstall: false,
    logger: undefined,
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
  };
}

function createService({
  isPackaged = true,
  messageBoxResponse = 0,
  version = '2.0.0',
} = {}) {
  const updater = createUpdater();
  const getUpdater = vi.fn(() => updater);
  const writeLog = vi.fn();
  const showMessageBox = vi.fn(async () => ({ response: messageBoxResponse, checkboxChecked: false }));
  const service = new ElectronUpdaterService({
    isPackaged: () => isPackaged,
    getVersion: () => version,
    getUpdater,
    showMessageBox,
    writeLog,
  });

  return {
    service,
    getUpdater,
    updater,
    showMessageBox,
    writeLog,
  };
}

const updateInfo = {
  version: '0.2.0',
  releaseName: '0.2.0',
  releaseDate: '2026-06-22T00:00:00.000Z',
  releaseNotes: 'Bug fixes',
  files: [],
  path: 'HackDesk-0.2.0.zip',
  sha512: 'abc',
} as const;

describe('ElectronUpdaterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects update checks outside packaged Electron builds', async () => {
    const { service, updater } = createService({ isPackaged: false });

    await expect(service.checkForUpdates()).rejects.toThrow('packaged Electron builds');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('rejects beta update checks before accessing electron-updater', async () => {
    const { service, getUpdater, updater } = createService({ version: '2.0.0-beta.2' });

    await expect(service.checkForUpdates()).rejects.toThrow('manual updates');

    expect(getUpdater).not.toHaveBeenCalled();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('configures the updater and returns up-to-date when no update is available', async () => {
    const { service, updater } = createService();
    updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo,
    });

    await expect(service.checkForUpdates()).resolves.toEqual({ status: 'upToDate' });

    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.autoRunAppAfterInstall).toBe(true);
    expect(updater.setFeedURL).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('returns declined when the user chooses later', async () => {
    const { service, updater, showMessageBox } = createService({ messageBoxResponse: 1 });
    updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo,
    });

    await expect(service.checkForUpdates()).resolves.toEqual({
      status: 'declined',
      version: '0.2.0',
    });

    expect(showMessageBox).toHaveBeenCalledWith(undefined, expect.objectContaining({
      buttons: ['Install', 'Later'],
      message: 'HackDesk 0.2.0 is available.',
    }));
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('downloads the update after explicit user confirmation', async () => {
    const { service, updater } = createService();
    updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo,
    });
    updater.downloadUpdate.mockResolvedValue([]);

    await expect(service.checkForUpdates()).resolves.toEqual({
      status: 'installed',
      version: '0.2.0',
      restart_required: true,
    });

    expect(updater.downloadUpdate).toHaveBeenCalled();
  });

  it('logs and rethrows download failures', async () => {
    const { service, updater, writeLog } = createService();
    updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo,
    });
    updater.downloadUpdate.mockRejectedValue(new Error('network failed'));

    await expect(service.checkForUpdates()).rejects.toThrow('network failed');
    expect(writeLog).toHaveBeenCalledWith('updater', 'Electron update check failed', {
      error: 'network failed',
    }, 'error');
  });

  it('forwards updater logger messages to debug logs', () => {
    const writeLog = vi.fn();
    const logger = createUpdaterLogger(writeLog);

    logger.warn('slow feed', { status: 503 });
    logger.error(new Error('bad signature'));

    expect(writeLog).toHaveBeenCalledWith('updater', 'slow feed', [{ status: 503 }], 'warn');
    expect(writeLog).toHaveBeenCalledWith('updater', 'Error: bad signature', undefined, 'error');
  });
});
