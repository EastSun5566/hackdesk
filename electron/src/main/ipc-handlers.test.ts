import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { WindowManager } from './window-manager';
import type { watchLocalVault } from './local-vault-service';
import { EventEmitter } from 'node:events';

import { ELECTRON_CHANNELS } from '../shared/channels';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const clipboardMock = vi.hoisted(() => ({
  writeText: vi.fn(async (): Promise<void> => undefined),
}));
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
  getNoteIfChanged: vi.fn(),
  restoreNote: vi.fn(),
  listTrash: vi.fn(),
  restoreNotes: vi.fn(),
  listNoteVersions: vi.fn(),
  getNoteVersion: vi.fn(),
  compareNoteVersions: vi.fn(),
  createNoteVersion: vi.fn(),
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
const localVaultMutationResult = vi.hoisted(() => ({
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
}));
const localVaultFolderMutationResult = vi.hoisted(() => ({
  folder: {
    id: 'local-folder:Projects/Design',
    name: 'Design',
    relativePath: 'Projects/Design',
    parentPath: 'Projects',
    createdAtMillis: 1,
    updatedAtMillis: 1,
  },
  snapshot: localVaultSnapshot,
}));
const localVaultServiceMock = vi.hoisted(() => ({
  createLocalFolder: vi.fn(),
  createLocalNote: vi.fn(async () => localVaultMutationResult),
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
  watchLocalVault: vi.fn<typeof watchLocalVault>(() => ({ close: vi.fn(), pause: vi.fn(), resume: vi.fn() })),
  writeLocalNote: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getName: vi.fn(() => 'HackDesk'),
  },
  clipboard: clipboardMock,
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
  getNoteIfChanged: hackmdServiceMock.getNoteIfChanged,
  getTeamFolder: vi.fn(),
  getTeamFolderOrder: vi.fn(),
  listFolders: vi.fn(),
  listHistory: vi.fn(),
  listNotes: vi.fn(),
  listTeamFolders: vi.fn(),
  listTeamNotes: vi.fn(),
  listTeams: vi.fn(),
  restoreNote: hackmdServiceMock.restoreNote,
  listTrash: hackmdServiceMock.listTrash,
  restoreNotes: hackmdServiceMock.restoreNotes,
  listNoteVersions: hackmdServiceMock.listNoteVersions,
  getNoteVersion: hackmdServiceMock.getNoteVersion,
  compareNoteVersions: hackmdServiceMock.compareNoteVersions,
  createNoteVersion: hackmdServiceMock.createNoteVersion,
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
  getMainWindow: vi.fn<WindowManager['getMainWindow']>(() => null),
  getTargetWindow: vi.fn(() => null),
  getWindowPresentationState: vi.fn(() => ({ fullScreen: true })),
  hideQuickCaptureWindow: vi.fn(),
  isTrustedIpcSender: vi.fn(() => true),
  resolveQuickCaptureSubmission: vi.fn(),
  setMenuShortcutsIgnored: vi.fn(),
  setThemeSurface: vi.fn(),
  submitQuickCapture: vi.fn(async () => ({ accepted: true as const })),
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

  it('validates request IDs and cancels only the trusted owner request', async () => {
    const registration = registerIpcHandlers(windowManager);
    const read = ipcHandlers.get(ELECTRON_CHANNELS.hackmdGetNoteIfChanged)!;
    const cancel = ipcHandlers.get(ELECTRON_CHANNELS.hackmdCancelRequest)!;
    const sender = Object.assign(new EventEmitter(), { isDestroyed: () => false });
    const other = Object.assign(new EventEmitter(), { isDestroyed: () => false });
    const requestId = '930d83f6-a454-4a54-9d7c-0535ab682112';
    expect(() => read({ sender }, 'note-1', null, '"1"', { requestId: 'invalid' })).toThrow(/Invalid/);
    expect(hackmdServiceMock.getNoteIfChanged).not.toHaveBeenCalled();
    let signal!: AbortSignal;
    hackmdServiceMock.getNoteIfChanged.mockImplementationOnce((_id, _team, _etag, input: AbortSignal) => {
      signal = input;
      return new Promise((_resolve, reject) => input.addEventListener('abort', () => reject(input.reason), { once: true }));
    });
    const pending = expect(read({ sender }, 'note-1', null, '"1"', { requestId })).rejects.toMatchObject({ name: 'AbortError' });
    cancel({ sender: other }, requestId);
    expect(signal.aborted).toBe(false);
    windowManager.isTrustedIpcSender.mockReturnValueOnce(false);
    expect(() => cancel({ sender }, requestId)).toThrow('Blocked untrusted IPC sender');
    expect(signal.aborted).toBe(false);
    expect(() => cancel({ sender }, 'invalid')).toThrow(/Invalid/);
    cancel({ sender }, requestId);
    await pending;
    registration.dispose();
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

  it('waits for the native clipboard write to finish', async () => {
    let finishWrite!: () => void;
    clipboardMock.writeText.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishWrite = resolve;
    }));
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appWriteClipboardText);

    const result = handler?.({}, 'Copied text');
    let settled = false;
    const completion = Promise.resolve(result).then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(clipboardMock.writeText).toHaveBeenCalledWith('Copied text');
    expect(settled).toBe(false);

    finishWrite();
    await completion;
    expect(settled).toBe(true);
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
    windowManager.getMainWindow.mockReturnValue({ webContents: { send } } as unknown as NonNullable<ReturnType<WindowManager['getMainWindow']>>);
    registerIpcHandlers(windowManager);

    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetSnapshot)?.({});
    onChange?.(localVaultSnapshot);

    expect(send).toHaveBeenCalledWith(ELECTRON_CHANNELS.localVaultDidChange, {
      snapshot: localVaultSnapshot,
    });
  });

  it('returns complete local folder mutation results over IPC', async () => {
    localVaultServiceMock.createLocalFolder.mockResolvedValueOnce(localVaultFolderMutationResult);
    localVaultServiceMock.renameLocalFolder.mockResolvedValueOnce(localVaultFolderMutationResult);
    registerIpcHandlers(windowManager);

    const created = await ipcHandlers.get(ELECTRON_CHANNELS.localVaultCreateFolder)?.({}, {
      name: 'Design',
      parentPath: 'Projects',
    });
    const renamed = await ipcHandlers.get(ELECTRON_CHANNELS.localVaultRenameFolder)?.({}, {
      relativePath: 'Projects/Old',
      name: 'Design',
    });

    expect(created).toEqual(localVaultFolderMutationResult);
    expect(renamed).toEqual(localVaultFolderMutationResult);
  });

  it('pauses the watcher during a local vault mutation without rebuilding it', async () => {
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

  it('does not restore a disconnected vault after an in-flight mutation finishes', async () => {
    const close = vi.fn();
    const pause = vi.fn();
    const resume = vi.fn();
    localVaultServiceMock.watchLocalVault.mockReturnValue({ close, pause, resume });
    let finishMutation!: (result: typeof localVaultMutationResult) => void;
    localVaultServiceMock.createLocalNote.mockImplementationOnce(() => new Promise((resolve) => {
      finishMutation = resolve;
    }));
    registerIpcHandlers(windowManager);
    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetSnapshot)?.({});

    const mutation = ipcHandlers.get(ELECTRON_CHANNELS.localVaultCreateNote)?.({}, {
      title: 'Draft',
      content: 'Body',
    });
    const mutationRejection = expect(mutation).rejects.toThrow('active local vault changed');
    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultDisconnect)?.({});
    finishMutation(localVaultMutationResult);
    await mutationRejection;

    expect(close).toHaveBeenCalledOnce();
    expect(localVaultServiceMock.watchLocalVault).toHaveBeenCalledOnce();
  });

  it('validates conditional note reads and restores before calling HackMD', () => {
    registerIpcHandlers(windowManager);

    ipcHandlers.get(ELECTRON_CHANNELS.hackmdGetNoteIfChanged)?.({}, 'note-1', null, 'W/"1"');
    ipcHandlers.get(ELECTRON_CHANNELS.hackmdRestoreNote)?.({}, 'note-1');

    expect(hackmdServiceMock.getNoteIfChanged).toHaveBeenCalledWith('note-1', null, 'W/"1"');
    expect(hackmdServiceMock.restoreNote).toHaveBeenCalledWith('note-1');
    expect(() => ipcHandlers.get(ELECTRON_CHANNELS.hackmdGetNoteIfChanged)?.({}, 'note-1', null, '')).toThrow();
    expect(() => ipcHandlers.get(ELECTRON_CHANNELS.hackmdRestoreNote)?.({}, '')).toThrow();
  });

  it('lists the trash and bounds a batch restore before calling HackMD', () => {
    registerIpcHandlers(windowManager);
    const list = ipcHandlers.get(ELECTRON_CHANNELS.hackmdListTrash);
    const restore = ipcHandlers.get(ELECTRON_CHANNELS.hackmdRestoreNotes);

    list?.({});
    restore?.({}, [' note-1 ', 'note-2']);

    expect(hackmdServiceMock.listTrash).toHaveBeenCalledWith();
    expect(hackmdServiceMock.restoreNotes).toHaveBeenCalledWith(['note-1', 'note-2']);
    expect(() => restore?.({}, [])).toThrow();
    expect(() => restore?.({}, ['note-1', ''])).toThrow();
    expect(() => restore?.({}, [1])).toThrow();
    expect(() => restore?.({}, 'note-1')).toThrow();
    expect(() => restore?.({}, Array.from({ length: 101 }, (_, index) => `note-${index}`))).toThrow();
    expect(() => list?.({}, { requestId: 'invalid' })).toThrow(/Invalid/);
  });

  it('validates version history reads before calling HackMD', () => {
    registerIpcHandlers(windowManager);
    const list = ipcHandlers.get(ELECTRON_CHANNELS.hackmdListNoteVersions);
    const read = ipcHandlers.get(ELECTRON_CHANNELS.hackmdGetNoteVersion);
    const compare = ipcHandlers.get(ELECTRON_CHANNELS.hackmdCompareNoteVersions);

    list?.({}, 'note-1', { namedOnly: true, page: 2, limit: 20 });
    read?.({}, 'note-1', 'v-1');
    compare?.({}, 'note-1', 'version:v-1', 'note_content');

    expect(hackmdServiceMock.listNoteVersions).toHaveBeenCalledWith('note-1', { namedOnly: true, page: 2, limit: 20 });
    expect(hackmdServiceMock.getNoteVersion).toHaveBeenCalledWith('note-1', 'v-1');
    expect(hackmdServiceMock.compareNoteVersions).toHaveBeenCalledWith('note-1', 'version:v-1', 'note_content');
    expect(() => list?.({}, 'note-1', { page: 0 })).toThrow();
    expect(() => list?.({}, 'note-1', { limit: 500 })).toThrow();
    expect(() => list?.({}, 'note-1', { sort: 'asc' })).toThrow();
    expect(() => compare?.({}, 'note-1', 'version:v-1&target=x', 'note_content')).toThrow();
    expect(() => compare?.({}, 'note-1', 'HEAD', 'note_content')).toThrow();
    expect(() => read?.({}, 'note-1', '')).toThrow();
  });

  it('trims and bounds a new version name before calling HackMD', () => {
    registerIpcHandlers(windowManager);
    const create = ipcHandlers.get(ELECTRON_CHANNELS.hackmdCreateNoteVersion);

    create?.({}, 'note-1', { name: '  Before launch  ', description: ' Ready ' });

    expect(hackmdServiceMock.createNoteVersion).toHaveBeenCalledWith('note-1', { name: 'Before launch', description: 'Ready' });
    expect(() => create?.({}, 'note-1', { name: '   ' })).toThrow();
    expect(() => create?.({}, 'note-1', { name: 'x'.repeat(81) })).toThrow();
    expect(() => create?.({}, 'note-1', { name: 'ok', description: 'x'.repeat(501) })).toThrow();
    expect(() => create?.({}, 'note-1', { name: 'ok', base: 'version:v-1' })).toThrow();
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

    handler?.({}, { requestId: 'capture-request', accepted: true as const });

    expect(windowManager.resolveQuickCaptureSubmission).toHaveBeenCalledWith({
      requestId: 'capture-request',
      accepted: true,
    });
    expect(() => handler?.({}, { requestId: '', accepted: false, error: '' })).toThrow(
      /Invalid app:resolve-quick-capture-submission payload/,
    );
  });
});
