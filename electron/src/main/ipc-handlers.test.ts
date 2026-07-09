import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ELECTRON_CHANNELS } from '../shared/channels';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const settingsMock = vi.hoisted(() => ({
  readHackmdCliAccessToken: vi.fn(async () => 'cli-token'),
  updateStoredSettings: vi.fn(async () => ({
    title: 'HackDesk',
    appearance: null,
    hasHackmdApiToken: true,
    hasAppearanceSettings: true,
    hackmdCliConfig: { hasAccessToken: true, hasCustomEndpoint: false },
    onboarding: { hackmdTokenSetupDeferred: false },
    shouldShowHackmdOnboarding: false,
  })),
  getSafeSettings: vi.fn(),
}));
const hackmdServiceMock = vi.hoisted(() => ({
  validateToken: vi.fn(async () => ({
    id: 'user-1',
    email: 'michael@example.com',
    name: 'Michael',
    username: 'michael',
    photo: null,
    upgraded: false,
    teams: [],
  })),
}));

vi.mock('electron', () => ({
  app: {
    getName: vi.fn(() => 'HackDesk'),
  },
  clipboard: {
    writeText: vi.fn(),
  },
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 1 })),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));

vi.mock('./settings', () => settingsMock);
vi.mock('./hackmd-service', () => ({
  createFolder: vi.fn(),
  createNote: vi.fn(),
  createTeamFolder: vi.fn(),
  createTeamNote: vi.fn(),
  deleteFolder: vi.fn(),
  deleteNote: vi.fn(),
  deleteTeamFolder: vi.fn(),
  deleteTeamNote: vi.fn(),
  getCurrentUser: vi.fn(),
  getFolder: vi.fn(),
  getFolderOrder: vi.fn(),
  getNote: vi.fn(),
  getTeamFolder: vi.fn(),
  getTeamFolderOrder: vi.fn(),
  listFolders: vi.fn(),
  listHistory: vi.fn(),
  listNotes: vi.fn(),
  listTeamFolders: vi.fn(),
  listTeamNotes: vi.fn(),
  listTeams: vi.fn(),
  updateFolder: vi.fn(),
  updateFolderOrder: vi.fn(),
  updateNote: vi.fn(),
  updateTeamFolder: vi.fn(),
  updateTeamFolderOrder: vi.fn(),
  updateTeamNote: vi.fn(),
  uploadNoteImage: vi.fn(),
  validateToken: hackmdServiceMock.validateToken,
}));
vi.mock('./url-policy', () => ({
  openExternalUrl: vi.fn(),
  openHackmdEditor: vi.fn(),
}));
vi.mock('./app-file-dialog', () => ({
  openTextFile: vi.fn(),
  saveTextFile: vi.fn(),
}));
vi.mock('./app-updater', () => ({
  checkForElectronUpdates: vi.fn(),
}));
vi.mock('./logging', () => ({
  exportDebugLogs: vi.fn(),
  recordFatalRendererError: vi.fn(),
  writeLog: vi.fn(),
}));
vi.mock('./global-shortcuts', () => ({
  getQuickCaptureShortcutStatus: vi.fn(() => ({
    accelerator: 'Control+Alt+H',
    registered: true,
  })),
}));

import { registerIpcHandlers } from './ipc-handlers';

const windowManager = {
  cancelClose: vi.fn(),
  closeQuickCaptureWindow: vi.fn(),
  confirmClose: vi.fn(),
  getTargetWindow: vi.fn(() => null),
  setMenuShortcutsIgnored: vi.fn(),
  setThemeSurface: vi.fn(),
  submitQuickCapture: vi.fn(),
};

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
  });

  it('imports hackmd-cli token by validating then saving it', async () => {
    registerIpcHandlers(windowManager);

    const handler = ipcHandlers.get(ELECTRON_CHANNELS.settingsImportHackmdCliToken);
    const result = await handler?.({});

    expect(settingsMock.readHackmdCliAccessToken).toHaveBeenCalledOnce();
    expect(hackmdServiceMock.validateToken).toHaveBeenCalledWith('cli-token');
    expect(settingsMock.updateStoredSettings).toHaveBeenCalledWith({ hackmdApiToken: 'cli-token' });
    expect(result).toMatchObject({
      settings: {
        hasHackmdApiToken: true,
        onboarding: { hackmdTokenSetupDeferred: false },
      },
      user: {
        username: 'michael',
      },
    });
  });

  it('does not save hackmd-cli token when validation fails', async () => {
    hackmdServiceMock.validateToken.mockRejectedValueOnce(new Error('Invalid token'));
    registerIpcHandlers(windowManager);

    const handler = ipcHandlers.get(ELECTRON_CHANNELS.settingsImportHackmdCliToken);

    await expect(handler?.({})).rejects.toThrow('Invalid token');
    expect(settingsMock.updateStoredSettings).not.toHaveBeenCalled();
  });

  it('validates and applies renderer menu shortcut policy changes', async () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appSetMenuShortcutsIgnored);

    await handler?.({}, true);
    expect(windowManager.setMenuShortcutsIgnored).toHaveBeenCalledWith(true);

    expect(() => handler?.({}, 'true')).toThrow(/Invalid app:set-menu-shortcuts-ignored payload/);
  });

  it('exposes quick capture shortcut status', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appGetQuickCaptureShortcutStatus);

    expect(handler?.({})).toEqual({
      accelerator: 'Control+Alt+H',
      registered: true,
    });
  });

  it('validates and forwards quick capture submissions', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appSubmitQuickCapture);

    handler?.({}, '  # Capture  ');

    expect(windowManager.submitQuickCapture).toHaveBeenCalledWith('# Capture');
    expect(() => handler?.({}, '   ')).toThrow(/Invalid app:submit-quick-capture payload/);
  });

  it('closes the quick capture window from renderer requests', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appCloseQuickCapture);

    handler?.({});

    expect(windowManager.closeQuickCaptureWindow).toHaveBeenCalledOnce();
  });
});
