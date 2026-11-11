import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { WindowManager } from './window-manager';
import type { watchLocalVault } from './local-vault-service';
import { EventEmitter } from 'node:events';
import { dialog } from 'electron';

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
  readStoredSettings: vi.fn(),
}));
const aiServiceMock = vi.hoisted(() => ({
  listProviders: vi.fn(async () => []),
  refresh: vi.fn(),
  runTurn: vi.fn(),
  askNotes: vi.fn(async (_input: unknown, _signal: AbortSignal, _onDelta: (text: string) => void) => 'answer'),
  prewarm: vi.fn(async () => undefined),
  applySettings: vi.fn(),
  dispose: vi.fn(),
}));
const hackmdServiceMock = vi.hoisted(() => ({
  getNoteIfChanged: vi.fn(),
  resolveNote: vi.fn(),
  restoreNote: vi.fn(),
  listTrash: vi.fn(),
  restoreNotes: vi.fn(),
  listNoteComments: vi.fn(),
  setNoteCommentResolved: vi.fn(),
  listNoteVersions: vi.fn(),
  getNoteVersion: vi.fn(),
  compareNoteVersions: vi.fn(),
  createNoteVersion: vi.fn(),
  updateNoteVersion: vi.fn(),
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
  readLocalVaultNotesForIndex: vi.fn(async () => []),
  browseLocalDirectories: vi.fn(async () => ({ path: '/tmp', parent: '/', home: '/tmp', entries: [] })),
  createLocalDirectory: vi.fn(async () => ({ path: '/tmp/new' })),
  resolveLocalDirectory: vi.fn(async (path: string) => path),
  createLocalFolder: vi.fn(),
  createLocalNote: vi.fn(async () => localVaultMutationResult),
  getActiveLocalVaultSnapshot: vi.fn(async () => localVaultSnapshot),
  readLocalVaultIdentity: vi.fn(async (): Promise<{ rootPath: string; vaultId: string } | null> => null),
  LOCAL_VAULT_SIZE_LIMIT: 20_000,
  measureLocalVaultFolder: vi.fn(async () => ({ notes: 3, entries: 5, exceedsLimit: false })),
  // A window's own folder by id; without one, the active folder, as the service does.
  getLocalVaultSnapshotFor: vi.fn(async (vaultId?: string) => (
    vaultId ? localVaultSnapshot : localVaultServiceMock.getActiveLocalVaultSnapshot()
  )),
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
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/home/test'),
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
vi.mock('./ai/ai-service', () => ({ createAiService: vi.fn(() => aiServiceMock) }));
vi.mock('./local-vault-service', () => localVaultServiceMock);
const noteIndexMock = vi.hoisted(() => ({
  hackmdFallback: null,
  setKeepHackmdNotes: vi.fn(),
  indexVault: vi.fn(async () => undefined),
  forgetVaults: vi.fn(async () => undefined),
  forgetVault: vi.fn(async () => undefined),
  search: vi.fn(() => ({ matches: [], indexedCount: 0 })),
  findPassages: vi.fn(() => ({ passages: [], indexedCount: 0 })),
  status: vi.fn(() => ({ hackmdNotes: 0, hackmdBytes: 0, localNotes: 0 })),
  resolveLink: vi.fn(() => null),
  backlinks: vi.fn(() => ({ notes: [], hackmdIndexed: 0 })),
  close: vi.fn(async () => undefined),
}));
vi.mock('./note-index/note-index-service', () => ({ createNoteIndexService: () => noteIndexMock }));
vi.mock('./hackmd-service', () => ({
  clearHackmdCache: vi.fn(),
  setHackmdDurableFallback: vi.fn(),
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
  listNoteComments: hackmdServiceMock.listNoteComments,
  setNoteCommentResolved: hackmdServiceMock.setNoteCommentResolved,
  listNoteVersions: hackmdServiceMock.listNoteVersions,
  getNoteVersion: hackmdServiceMock.getNoteVersion,
  compareNoteVersions: hackmdServiceMock.compareNoteVersions,
  createNoteVersion: hackmdServiceMock.createNoteVersion,
  updateNoteVersion: hackmdServiceMock.updateNoteVersion,
  updateFolder: vi.fn(),
  updateFolderOrder: vi.fn(),
  updateNote: vi.fn(),
  updateTeamFolder: vi.fn(),
  updateTeamFolderOrder: vi.fn(),
  updateTeamNote: vi.fn(),
  uploadNoteImage: vi.fn(),
  validateToken: hackmdServiceMock.validateToken,
  resolveNote: hackmdServiceMock.resolveNote,
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
import { clearHackmdCache } from './hackmd-service';

const windowManager = {
  cancelClose: vi.fn(),
  cancelCloseForSender: vi.fn(),
  holdClose: vi.fn(),
  holdCloseForSender: vi.fn(),
  confirmClose: vi.fn(),
  confirmCloseForSender: vi.fn(),
  getMainWindow: vi.fn<WindowManager['getMainWindow']>(() => null),
  getMainWindows: vi.fn(() => []),
  getMainWindowForWebContents: vi.fn(() => null),
  sendToAllMainWindows: vi.fn(),
  newMainWindow: vi.fn(),
  getTargetWindow: vi.fn(() => null),
  getWindowPresentationState: vi.fn(() => ({ fullScreen: true })),
  getWindowPresentationStateForSender: vi.fn(() => ({ fullScreen: true })),
  hideQuickCaptureWindow: vi.fn(),
  isTrustedIpcSender: vi.fn(() => true),
  resolveQuickCaptureSubmission: vi.fn(),
  setMenuShortcutsIgnored: vi.fn(),
  setThemeSurface: vi.fn(),
  submitQuickCapture: vi.fn(async () => ({ accepted: true as const })),
  showPresentationWindow: vi.fn(),
  getPresentationDeck: vi.fn(() => ({ title: 'Deck', content: '# One', fullScreen: false })),
  closePresentationWindow: vi.fn(),
  togglePresentationFullScreen: vi.fn(() => true),
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

  it('streams AI turn deltas to the requesting window and cancels only its own turn', async () => {
    const registration = registerIpcHandlers(windowManager);
    const run = ipcHandlers.get(ELECTRON_CHANNELS.aiRunTurn)!;
    const cancel = ipcHandlers.get(ELECTRON_CHANNELS.aiCancelTurn)!;
    const send = vi.fn();
    const sender = Object.assign(new EventEmitter(), { isDestroyed: () => false, send });
    const other = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() });
    const requestId = '6c4a1a39-5d9b-4c4f-9a43-5f1c2b0d9e11';
    const input = { requestId, providerId: 'claude', action: 'summarize', text: 'Note' };
    expect(() => run({ sender }, { ...input, providerId: 'gemini' })).toThrow(/Invalid/);
    expect(() => run({ sender }, { ...input, command: '/bin/sh' })).toThrow(/Invalid/);
    let signal!: AbortSignal;
    aiServiceMock.runTurn.mockImplementationOnce((_input, input: AbortSignal, onDelta: (text: string) => void) => {
      signal = input;
      onDelta('Sum');
      return new Promise((_resolve, reject) => input.addEventListener('abort', () => reject(input.reason), { once: true }));
    });
    const pending = expect(run({ sender }, input)).rejects.toMatchObject({ name: 'AbortError' });
    expect(send).toHaveBeenCalledWith(ELECTRON_CHANNELS.aiTurnDelta, { requestId, text: 'Sum' });
    cancel({ sender: other }, requestId);
    expect(signal.aborted).toBe(false);
    cancel({ sender }, requestId);
    await pending;
    registration.dispose();
    expect(aiServiceMock.dispose).toHaveBeenCalledOnce();
  });

  it('validates questions about notes and streams their answers to the asking window', async () => {
    registerIpcHandlers(windowManager);
    const scope = { type: 'local', vaultId: 'vault-1' };
    await ipcHandlers.get(ELECTRON_CHANNELS.noteIndexFindPassages)?.({}, { question: ' 結論是什麼？ ', scope });
    expect(noteIndexMock.findPassages).toHaveBeenCalledWith({ question: '結論是什麼？', scope });
    expect(() => ipcHandlers.get(ELECTRON_CHANNELS.noteIndexFindPassages)?.({}, { question: '  ', scope })).toThrow(/Invalid/);

    const ask = ipcHandlers.get(ELECTRON_CHANNELS.aiAskNotes)!;
    const send = vi.fn();
    const sender = Object.assign(new EventEmitter(), { isDestroyed: () => false, send });
    const input = {
      requestId: '6c4a1a39-5d9b-4c4f-9a43-5f1c2b0d9e11',
      providerId: 'claude',
      question: 'What did we decide?',
      sources: [{ title: 'Weekly', text: 'We ship offline reading.' }],
      history: [],
    };
    aiServiceMock.askNotes.mockImplementationOnce(async (_input, _signal, onDelta: (text: string) => void) => {
      onDelta('Offline [1]');
      return 'Offline [1]';
    });
    await expect(ask({ sender }, input)).resolves.toBe('Offline [1]');
    expect(send).toHaveBeenCalledWith(ELECTRON_CHANNELS.aiTurnDelta, { requestId: input.requestId, text: 'Offline [1]' });
    expect(() => ask({ sender }, { ...input, sources: [] })).toThrow(/Invalid/);
    expect(() => ask({ sender }, { ...input, sources: Array.from({ length: 9 }, () => input.sources[0]) })).toThrow(/Invalid/);
    expect(() => ask({ sender }, { ...input, history: [{ question: 'a', answer: 'x'.repeat(2_001) }] })).toThrow(/Invalid/);
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

  it('keeps cached HackMD notes across settings saves unless the token changes', async () => {
    registerIpcHandlers(windowManager);
    const update = ipcHandlers.get(ELECTRON_CHANNELS.settingsUpdate);
    vi.mocked(clearHackmdCache).mockClear();

    await update?.({}, { title: 'Renamed' });
    expect(clearHackmdCache).not.toHaveBeenCalled();

    await update?.({}, { offline: { keepHackmdNotes: false } });
    expect(noteIndexMock.setKeepHackmdNotes).toHaveBeenCalledWith(false);
    expect(clearHackmdCache).not.toHaveBeenCalled();

    await update?.({}, { hackmdApiToken: '' });
    expect(clearHackmdCache).toHaveBeenCalledOnce();
  });

  it('searches note text and clears the cache through the note index', async () => {
    registerIpcHandlers(windowManager);
    const input = { query: 'offline', scope: { type: 'hackmd', teamPath: null } };
    await ipcHandlers.get(ELECTRON_CHANNELS.noteIndexSearch)?.({}, input);
    expect(noteIndexMock.search).toHaveBeenCalledWith(input);
    expect(() => ipcHandlers.get(ELECTRON_CHANNELS.noteIndexSearch)?.({}, { query: 'x'.repeat(201), scope: input.scope })).toThrow('Too big');

    vi.mocked(clearHackmdCache).mockClear();
    await ipcHandlers.get(ELECTRON_CHANNELS.noteIndexClear)?.({});
    expect(clearHackmdCache).toHaveBeenCalledOnce();
  });

  it('resolves note links locally, and through HackMD only on request', async () => {
    registerIpcHandlers(windowManager);
    const link = { target: './b.md', kind: 'url', from: { source: 'local', vaultId: 'vault-1', noteId: 'a.md' } };
    await ipcHandlers.get(ELECTRON_CHANNELS.noteIndexResolveLink)?.({}, link);
    expect(noteIndexMock.resolveLink).toHaveBeenCalledWith(link);
    expect(() => ipcHandlers.get(ELECTRON_CHANNELS.noteIndexResolveLink)?.({}, { ...link, kind: 'image' })).toThrow();

    const target = { source: 'hackmd', id: 'note-1', shortId: 'abc', permalink: null, userPath: 'me', teamPath: null };
    await ipcHandlers.get(ELECTRON_CHANNELS.noteIndexBacklinks)?.({}, { target });
    expect(noteIndexMock.backlinks).toHaveBeenCalledWith({ target });

    await ipcHandlers.get(ELECTRON_CHANNELS.hackmdResolveNote)?.({}, ' @fixture/beta ');
    expect(hackmdServiceMock.resolveNote.mock.calls[0]?.[0]).toBe('@fixture/beta');
    expect(() => ipcHandlers.get(ELECTRON_CHANNELS.hackmdResolveNote)?.({}, '')).toThrow();
  });

  it('imports hackmd-cli token by validating then saving it', async () => {
    registerIpcHandlers(windowManager);

    const handler = ipcHandlers.get(ELECTRON_CHANNELS.settingsImportHackmdCliToken);
    const result = await handler?.({});

    expect(settingsMock.readHackmdCliAccessToken).toHaveBeenCalledOnce();
    expect(hackmdServiceMock.validateToken).toHaveBeenCalledWith('cli-token');
    expect(settingsMock.updateStoredSettings).toHaveBeenCalledWith({ hackmdApiToken: 'cli-token', hackmdAccountLabel: '@michael' });
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

  it('exposes the requesting window presentation state', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appGetWindowPresentationState);

    expect(handler?.({ sender: 'sender' })).toEqual({ fullScreen: true });
    expect(windowManager.getWindowPresentationStateForSender).toHaveBeenCalledWith('sender');
  });

  it('opens a new window with a validated workspace', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appNewWindow);

    handler?.({}, { workspace: { type: 'team', label: 'Atlas', teamPath: 'atlas' } });

    expect(windowManager.newMainWindow).toHaveBeenCalledWith({
      workspace: { type: 'team', label: 'Atlas', teamPath: 'atlas' },
    });
  });

  it('rejects a new window whose team workspace names no team', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appNewWindow);

    expect(() => handler?.({}, { workspace: { type: 'team', label: 'Atlas' } })).toThrow('must name its team');
    expect(windowManager.newMainWindow).not.toHaveBeenCalled();
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

  it('applies a local workspace edit and returns the active snapshot', async () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.localVaultWorkspace);

    const result = await handler?.({}, { type: 'create', name: 'Work', vaultIds: ['vault-a'] });

    expect(settingsMock.updateStoredSettings).toHaveBeenCalledWith({
      localWorkspace: { type: 'create', name: 'Work', vaultIds: ['vault-a'] },
    });
    expect(result).toMatchObject({ snapshot: localVaultSnapshot });
  });

  it('rejects a local workspace edit that names no valid action', async () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.localVaultWorkspace);

    await expect(handler?.({}, { type: 'explode' })).rejects.toThrow();
    expect(settingsMock.updateStoredSettings).not.toHaveBeenCalled();
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

  it('scans a known workspace folder without changing the active vault', async () => {
    settingsMock.readStoredSettings.mockResolvedValueOnce({
      localVault: {
        vaults: [{ id: 'vault-a', path: '/tmp/A' }, { id: 'vault-b', path: '/tmp/B' }],
        activeVaultId: 'vault-a',
        workspaces: [],
        activeWorkspaceId: null,
      },
    });
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetVaultSnapshot);

    expect(await handler?.({}, { vaultId: 'vault-b' })).toEqual(localVaultSnapshot);

    expect(localVaultServiceMock.scanLocalVault).toHaveBeenCalledWith('/tmp/B');
    expect(settingsMock.updateStoredSettings).not.toHaveBeenCalled();
  });

  it('rejects a workspace folder that is no longer configured', async () => {
    settingsMock.readStoredSettings.mockResolvedValueOnce({
      localVault: { vaults: [{ id: 'vault-a', path: '/tmp/A' }], activeVaultId: 'vault-a', workspaces: [], activeWorkspaceId: null },
    });
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetVaultSnapshot);

    await expect(handler?.({}, { vaultId: 'vault-gone' })).rejects.toThrow('no longer configured');
    expect(localVaultServiceMock.scanLocalVault).not.toHaveBeenCalled();
  });

  it('rejects an invalid workspace folder request', async () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetVaultSnapshot);

    await expect(handler?.({}, { vaultId: '' })).rejects.toThrow('Invalid');
  });

  it('sends local vault watcher changes to the main window', async () => {
    let onChange: ((snapshot: typeof localVaultSnapshot) => void) | undefined;
    localVaultServiceMock.watchLocalVault.mockImplementation((_path, callback) => {
      onChange = callback;
      return { close: vi.fn(), pause: vi.fn(), resume: vi.fn() };
    });
    registerIpcHandlers(windowManager);

    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetSnapshot)?.({});
    onChange?.(localVaultSnapshot);

    expect(windowManager.sendToAllMainWindows).toHaveBeenCalledWith(ELECTRON_CHANNELS.localVaultDidChange, {
      snapshot: localVaultSnapshot,
    });
  });

  it('chooses a vault from an in-app picker path after resolving it and confirming it natively', async () => {
    localVaultServiceMock.resolveLocalDirectory.mockResolvedValueOnce('/tmp/picked');
    vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.localVaultChoosePath);

    expect(await handler?.({}, { path: '/tmp/picked' })).toMatchObject({ canceled: false });
    expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Use “picked” as a vault folder?',
      detail: expect.stringContaining('3 Markdown notes'),
    }));

    expect(localVaultServiceMock.resolveLocalDirectory).toHaveBeenCalledWith('/tmp/picked');
    expect(localVaultServiceMock.scanLocalVault).toHaveBeenCalledWith('/tmp/picked');
    expect(settingsMock.updateStoredSettings).toHaveBeenCalledWith({ localVaultPath: '/tmp/picked' });
    expect(localVaultServiceMock.watchLocalVault).toHaveBeenCalled();
  });

  it('changes nothing when the picked folder is not confirmed, and warns about a huge one', async () => {
    localVaultServiceMock.resolveLocalDirectory.mockResolvedValueOnce('/home/test');
    localVaultServiceMock.measureLocalVaultFolder.mockResolvedValueOnce({ notes: 900, entries: 20_000, exceedsLimit: true });
    vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.localVaultChoosePath);

    expect(await handler?.({}, { path: '/home/test' })).toEqual({ canceled: true });
    expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      type: 'warning',
      defaultId: 1,
      detail: expect.stringContaining('more than 20,000 files and folders'),
    }));
    // Nothing is scanned, written or watched until the folder is confirmed.
    expect(localVaultServiceMock.scanLocalVault).not.toHaveBeenCalled();
    expect(settingsMock.updateStoredSettings).not.toHaveBeenCalled();
    expect(localVaultServiceMock.watchLocalVault).not.toHaveBeenCalled();
  });

  it('rejects a picker path that is not a folder', async () => {
    localVaultServiceMock.resolveLocalDirectory.mockRejectedValueOnce(new Error('That path is not a folder.'));
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.localVaultChoosePath);

    await expect(handler?.({}, { path: '/tmp/note.md' })).rejects.toThrow('not a folder');
    expect(localVaultServiceMock.scanLocalVault).not.toHaveBeenCalled();
  });

  it('browses folders and creates one from the in-app picker', async () => {
    registerIpcHandlers(windowManager);

    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultBrowse)?.({}, { path: '/tmp' });
    expect(localVaultServiceMock.browseLocalDirectories).toHaveBeenCalledWith('/tmp');

    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultBrowse)?.({}, undefined);
    expect(localVaultServiceMock.browseLocalDirectories).toHaveBeenCalledWith(undefined);

    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultCreateDirectory)?.({}, { parentPath: '/tmp', name: 'New' });
    expect(localVaultServiceMock.createLocalDirectory).toHaveBeenCalledWith('/tmp', 'New');

    expect(() => ipcHandlers.get(ELECTRON_CHANNELS.localVaultCreateDirectory)?.({}, { parentPath: '/tmp', name: '' })).toThrow();
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

  it('stops watching and searching a folder that was not open when it is forgotten', async () => {
    const vaults = { vaults: [{ id: 'vault-a', path: '/a' }, { id: 'vault-b', path: '/b' }], activeVaultId: 'vault-a', workspaces: [], activeWorkspaceId: null };
    settingsMock.readStoredSettings.mockResolvedValue({ localVault: vaults } as never);
    settingsMock.updateStoredSettings.mockResolvedValueOnce({
      localVault: { ...vaults, vaults: [vaults.vaults[0]] },
    } as never);
    localVaultServiceMock.readLocalVaultIdentity.mockResolvedValueOnce({ rootPath: '/real/b', vaultId: 'manifest-b' });
    const closeB = vi.fn();
    localVaultServiceMock.scanLocalVault.mockResolvedValueOnce({ ...localVaultSnapshot, rootPath: '/real/b' });
    localVaultServiceMock.watchLocalVault.mockReturnValueOnce({ close: closeB, pause: vi.fn(), resume: vi.fn() });
    registerIpcHandlers(windowManager);
    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultGetVaultSnapshot)?.({}, { vaultId: 'vault-b' });

    await ipcHandlers.get(ELECTRON_CHANNELS.localVaultForget)?.({}, { vaultId: 'vault-b' });

    expect(localVaultServiceMock.readLocalVaultIdentity).toHaveBeenCalledWith('/b');
    expect(noteIndexMock.forgetVault).toHaveBeenCalledWith('manifest-b');
    expect(closeB).toHaveBeenCalledOnce();
    // The open folder keeps its index.
    expect(noteIndexMock.forgetVaults).not.toHaveBeenCalled();
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

    list?.({}, null);
    restore?.({}, [' note-1 ', 'note-2']);

    expect(hackmdServiceMock.listTrash).toHaveBeenCalledWith(null);
    list?.({}, 'team/path');
    expect(hackmdServiceMock.listTrash).toHaveBeenCalledWith('team/path');
    expect(() => list?.({}, '')).toThrow();
    expect(hackmdServiceMock.restoreNotes).toHaveBeenCalledWith(['note-1', 'note-2']);
    expect(() => restore?.({}, [])).toThrow();
    expect(() => restore?.({}, ['note-1', ''])).toThrow();
    expect(() => restore?.({}, [1])).toThrow();
    expect(() => restore?.({}, 'note-1')).toThrow();
    expect(() => restore?.({}, Array.from({ length: 101 }, (_, index) => `note-${index}`))).toThrow();
    expect(() => list?.({}, null, { requestId: 'invalid' })).toThrow(/Invalid/);
  });

  it('validates comment reads and resolutions before calling HackMD', () => {
    registerIpcHandlers(windowManager);
    const list = ipcHandlers.get(ELECTRON_CHANNELS.hackmdListNoteComments);
    const resolve = ipcHandlers.get(ELECTRON_CHANNELS.hackmdSetNoteCommentResolved);
    const commentId = '930d83f6-a454-4a54-9d7c-0535ab682112';

    list?.({}, 'note-1', { page: 2 });
    resolve?.({}, 'note-1', commentId, true);

    expect(hackmdServiceMock.listNoteComments).toHaveBeenCalledWith('note-1', { page: 2 });
    expect(hackmdServiceMock.setNoteCommentResolved).toHaveBeenCalledWith('note-1', commentId, true);
    expect(() => list?.({}, 'note-1', { page: 0 })).toThrow();
    expect(() => list?.({}, 'note-1', { limit: 5 })).toThrow();
    expect(() => resolve?.({}, 'note-1', 'c-1/../x', true)).toThrow();
    expect(() => resolve?.({}, 'note-1', commentId, 'yes')).toThrow();
    expect(() => resolve?.({}, '', commentId, false)).toThrow();
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
    expect(() => create?.({}, 'note-1', { name: 'ok', base: 'HEAD' })).toThrow();
  });

  it('accepts a version base when naming, and bounds a version edit', () => {
    registerIpcHandlers(windowManager);
    const create = ipcHandlers.get(ELECTRON_CHANNELS.hackmdCreateNoteVersion);
    const update = ipcHandlers.get(ELECTRON_CHANNELS.hackmdUpdateNoteVersion);

    create?.({}, 'note-1', { name: 'Draft A', base: 'version:v-1' });
    update?.({}, 'note-1', 'v-2', { name: ' Launch v2 ', description: '' });

    expect(hackmdServiceMock.createNoteVersion).toHaveBeenCalledWith('note-1', { name: 'Draft A', base: 'version:v-1' });
    expect(hackmdServiceMock.updateNoteVersion).toHaveBeenCalledWith('note-1', 'v-2', { name: 'Launch v2', description: '' });
    expect(() => create?.({}, 'note-1', { name: 'x', base: 'version:v-1&x' })).toThrow();
    expect(() => update?.({}, 'note-1', 'v/2', { name: 'x', description: '' })).toThrow();
    expect(() => update?.({}, 'note-1', 'v-2', { name: '  ', description: '' })).toThrow();
    expect(() => update?.({}, 'note-1', 'v-2', { name: 'x', description: 'x'.repeat(501) })).toThrow();
    expect(() => update?.({}, 'note-1', 'v-2', { name: 'x' })).toThrow();
  });

  it('validates and forwards quick capture submissions', () => {
    registerIpcHandlers(windowManager);
    const handler = ipcHandlers.get(ELECTRON_CHANNELS.appSubmitQuickCapture);

    handler?.({}, '  # Capture  ');

    expect(windowManager.submitQuickCapture).toHaveBeenCalledWith('  # Capture  ');
    expect(() => handler?.({}, '   ')).toThrow(/Invalid app:submit-quick-capture payload/);
  });

  it('validates decks to present, and serves and closes the presentation', () => {
    registerIpcHandlers(windowManager);

    ipcHandlers.get(ELECTRON_CHANNELS.appOpenPresentation)?.({}, { title: 'Deck', content: '# One' });
    expect(windowManager.showPresentationWindow).toHaveBeenCalledWith({ title: 'Deck', content: '# One' });
    expect(() => ipcHandlers.get(ELECTRON_CHANNELS.appOpenPresentation)?.({}, { title: 'Deck' })).toThrow(/Invalid app:open-presentation payload/);
    expect(ipcHandlers.get(ELECTRON_CHANNELS.appGetPresentation)?.({})).toEqual({ title: 'Deck', content: '# One', fullScreen: false });
    ipcHandlers.get(ELECTRON_CHANNELS.appClosePresentation)?.({});
    expect(windowManager.closePresentationWindow).toHaveBeenCalledOnce();
    expect(ipcHandlers.get(ELECTRON_CHANNELS.appTogglePresentationFullScreen)?.({})).toBe(true);
    expect(windowManager.togglePresentationFullScreen).toHaveBeenCalledOnce();
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
