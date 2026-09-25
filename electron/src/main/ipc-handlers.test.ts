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
const localVaultSnapshot = vi.hoisted(() => ({
  vaultId: 'vault-1',
  rootPath: '/tmp/local-vault',
  notes: [],
  folders: [],
}));
const localVaultServiceMock = vi.hoisted(() => ({
  createLocalFolder: vi.fn(),
  createLocalNote: vi.fn(async () => ({
    document: {
      id: 'note-1',
      title: 'Draft',
      relativePath: 'Draft.md',
      parentPath: null,
      createdAtMillis: 1,
      updatedAtMillis: 1,
      revision: { contentHash: 'hash', mtimeMs: 1 },
      content: 'Body',
    },
    snapshot: localVaultSnapshot,
  })),
  getActiveLocalVaultSnapshot: vi.fn(async () => localVaultSnapshot),
  importLocalVaultAttachment: vi.fn(),
  moveLocalFolder: vi.fn(),
  moveLocalNote: vi.fn(),
  readLocalNote: vi.fn(),
  renameLocalFolder: vi.fn(),
  renameLocalNote: vi.fn(),
  revealLocalVaultFolder: vi.fn(),
  revealLocalVaultNote: vi.fn(),
  revealLocalVaultRoot: vi.fn(),
  scanLocalVault: vi.fn(async () => localVaultSnapshot),
  trashLocalFolder: vi.fn(),
  trashLocalNote: vi.fn(),
  watchLocalVault: vi.fn(() => ({ close: vi.fn(), pause: vi.fn(), resume: vi.fn() })),
  writeLocalNote: vi.fn(),
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
vi.mock('./local-vault-service', () => localVaultServiceMock);
vi.mock('./hackmd-service', () => ({
  clearHackmdCache: vi.fn(),
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
  confirmClose: vi.fn(),
  getMainWindow: vi.fn(() => null),
  getTargetWindow: vi.fn(() => null),
  getWindowPresentationState: vi.fn(() => ({ fullScreen: true })),
  hideQuickCaptureWindow: vi.fn(),
  isTrustedIpcSender: vi.fn(() => true),
  resolveQuickCaptureSubmission: vi.fn(),
  setMenuShortcutsIgnored: vi.fn(),
  setThemeSurface: vi.fn(),
  submitQuickCapture: vi.fn(async () => ({ accepted: true })),
};

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
  });

  it('rejects an untrusted sender before invoking a privileged handler', () => {
    windowManager.isTrustedIpcSender.mockReturnValueOnce(false);
    registerIpcHandlers(windowManager);

    const handler = ipcHandlers.get(ELECTRON_CHANNELS.settingsGet);
    expect(() => handler?.({})).toThrow('Blocked untrusted IPC sender');
    expect(settingsMock.getSafeSettings).not.toHaveBeenCalled();
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

  it('exposes the main window presentation state', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appGetWindowPresentationState);

    expect(handler?.({})).toEqual({ fullScreen: true });
    expect(windowManager.getWindowPresentationState).toHaveBeenCalledOnce();
  });

  it('keeps one local vault watcher for repeated snapshot requests', async () => {
    const close = vi.fn();
    localVaultServiceMock.watchLocalVault.mockReturnValue({ close, pause: vi.fn(), resume: vi.fn() });
    const registration = registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetSnapshot);

    await handler?.({});
    await handler?.({});

    expect(localVaultServiceMock.getActiveLocalVaultSnapshot).toHaveBeenCalledTimes(2);
    expect(localVaultServiceMock.watchLocalVault).toHaveBeenCalledOnce();

    registration.dispose();
    expect(close).toHaveBeenCalledOnce();
  });

  it('sends local vault watcher changes to the main window', async () => {
    let onChange: ((snapshot: typeof localVaultSnapshot) => void) | undefined;
    localVaultServiceMock.watchLocalVault.mockImplementation((_path, callback) => {
      onChange = callback;
      return { close: vi.fn(), pause: vi.fn(), resume: vi.fn() };
    });
    const send = vi.fn();
    windowManager.getMainWindow.mockReturnValue({ webContents: { send } });
    registerIpcHandlers(windowManager);

    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetSnapshot)?.({});
    onChange?.(localVaultSnapshot);

    expect(send).toHaveBeenCalledWith(ELECTRON_CHANNELS.localVaultDidChange, {
      snapshot: localVaultSnapshot,
    });
  });

  it('pauses the watcher during a local vault mutation without rescanning afterward', async () => {
    const close = vi.fn();
    const pause = vi.fn();
    const resume = vi.fn();
    localVaultServiceMock.watchLocalVault.mockReturnValue({ close, pause, resume });
    registerIpcHandlers(windowManager);
    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetSnapshot)?.({});

    const result = await ipcHandlers.get(ELECTRON_CHANNELS.localVaultCreateNote)?.({}, {
      title: 'Draft',
      content: 'Body',
    });

    expect(pause).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(localVaultServiceMock.createLocalNote).toHaveBeenCalledOnce();
    expect(localVaultServiceMock.getActiveLocalVaultSnapshot).toHaveBeenCalledOnce();
    expect(localVaultServiceMock.watchLocalVault).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ snapshot: localVaultSnapshot });
  });

  it('validates and forwards quick capture submissions', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appSubmitQuickCapture);

    handler?.({}, '  # Capture  ');

    expect(windowManager.submitQuickCapture).toHaveBeenCalledWith('  # Capture  ');
    expect(() => handler?.({}, '   ')).toThrow(/Invalid app:submit-quick-capture payload/);
  });

  it('hides the quick capture window from renderer requests', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appHideQuickCapture);

    handler?.({});

    expect(windowManager.hideQuickCaptureWindow).toHaveBeenCalledOnce();
  });

  it('validates and forwards quick capture submission acknowledgements', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appResolveQuickCaptureSubmission);

    handler?.({}, { requestId: 'capture-request', accepted: true });

    expect(windowManager.resolveQuickCaptureSubmission).toHaveBeenCalledWith({
      requestId: 'capture-request',
      accepted: true,
    });
    expect(() => handler?.({}, { requestId: '', accepted: false, error: '' })).toThrow(
      /Invalid app:resolve-quick-capture-submission payload/,
    );
  });
});
