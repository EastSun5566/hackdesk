import { app, clipboard, dialog, ipcMain as electronIpcMain, shell } from 'electron';
import type { IpcMainInvokeEvent, MessageBoxOptions } from 'electron';

import type {
  ConfirmDialogOptions,
  CreateFolderInput,
  CreateNoteInput,
  FolderOrder,
  OpenTextFileInput,
  QuickCaptureSubmissionAck,
  SaveTextFileInput,
  UpdateFolderInput,
  UpdateNoteInput,
  FatalRendererError,
  ThemeSurfaceInput,
  UploadNoteImageInput,
  NoteVersionRef,
  NoteCommentsQuery,
  NoteVersionsQuery,
  CreateNoteVersionInput,
  HackmdRequestOptions,
} from '../../../src/lib/electron-api';
import type {
  LocalVaultCreateFolderInput,
  LocalVaultCreateNoteInput,
  LocalVaultImportAttachmentInput,
  LocalVaultMoveFolderInput,
  LocalVaultMoveNoteInput,
  LocalVaultRenameFolderInput,
  LocalVaultRenameNoteInput,
  LocalVaultRevealFolderInput,
  LocalVaultRevealNoteInput,
  LocalVaultSnapshot,
  LocalVaultTrashFolderInput,
  LocalVaultTrashNoteInput,
  LocalVaultWriteInput,
} from '../../../src/lib/local-vault';
import { ELECTRON_CHANNELS } from '../shared/channels';
import {
  createFolder,
  createNote,
  createTeamFolder,
  createTeamNote,
  deleteFolder,
  deleteNote,
  deleteTeamFolder,
  deleteTeamNote,
  getCurrentUser,
  getFolder,
  getFolderOrder,
  getNote,
  getNoteIfChanged,
  getTeamFolder,
  getTeamFolderOrder,
  listFolders,
  listHistory,
  listNotes,
  listTeamFolders,
  listTeamNotes,
  listTeams,
  restoreNote,
  listTrash,
  restoreNotes,
  listNoteComments,
  setNoteCommentResolved,
  updateFolder,
  updateFolderOrder,
  updateNote,
  updateTeamFolder,
  updateTeamFolderOrder,
  updateTeamNote,
  uploadNoteImage,
  listNoteVersions,
  getNoteVersion,
  compareNoteVersions,
  createNoteVersion,
  validateToken,
  clearHackmdCache,
} from './hackmd-service';
import { getSafeSettings, readHackmdCliAccessToken, updateStoredSettings } from './settings';
import {
  createLocalFolder,
  createLocalNote,
  getActiveLocalVaultSnapshot,
  importLocalVaultAttachment,
  readLocalNote,
  revealLocalVaultFolder,
  revealLocalVaultNote,
  revealLocalVaultRoot,
  renameLocalFolder,
  renameLocalNote,
  moveLocalFolder,
  moveLocalNote,
  scanLocalVault,
  trashLocalFolder,
  trashLocalNote,
  watchLocalVault,
  writeLocalNote,
  type LocalVaultWatcher,
} from './local-vault-service';
import { openExternalUrl, openHackmdEditor } from './url-policy';
import { createHackmdRequests } from './hackmd-requests';
import type { WindowManager } from './window-manager';
import { openTextFile, saveTextFile } from './app-file-dialog';
import { checkForElectronUpdates } from './app-updater';
import { getQuickCaptureShortcutStatus } from './global-shortcuts';
import { exportDebugLogs, recordFatalRendererError } from './logging';
import {
  confirmDialogOptionsSchema,
  createFolderInputSchema,
  createNoteInputSchema,
  fatalRendererErrorSchema,
  folderOrderSchema,
  localVaultCreateFolderInputSchema,
  localVaultCreateNoteInputSchema,
  localVaultImportAttachmentInputSchema,
  localVaultMoveFolderInputSchema,
  localVaultMoveNoteInputSchema,
  localVaultRenameFolderInputSchema,
  localVaultRenameNoteInputSchema,
  localVaultRevealFolderInputSchema,
  localVaultRevealNoteInputSchema,
  localVaultTrashFolderInputSchema,
  localVaultTrashNoteInputSchema,
  localVaultWriteInputSchema,
  openHackmdEditorInputSchema,
  openTextFileInputSchema,
  quickCaptureContentSchema,
  quickCaptureSubmissionAckSchema,
  saveTextFileInputSchema,
  settingsUpdateSchema,
  themeSurfaceInputSchema,
  updateFolderInputSchema,
  updateNoteInputSchema,
  uploadNoteImageInputSchema,
  noteVersionRefSchema,
  createNoteVersionInputSchema,
  restoreNotesInputSchema,
  noteCommentsQuerySchema,
  noteCommentIdSchema,
  noteVersionsQuerySchema,
  hackmdRequestOptionsSchema,
  validateIpcInput,
  validateBoolean,
  validateNonEmptyString,
  validateOptionalNumber,
  validateString,
} from './ipc-validation';

export function registerIpcHandlers(
  windowManager: Pick<WindowManager,
    | 'cancelClose' | 'confirmClose' | 'getMainWindow' | 'getTargetWindow'
    | 'getWindowPresentationState' | 'hideQuickCaptureWindow' | 'isTrustedIpcSender'
    | 'resolveQuickCaptureSubmission' | 'setMenuShortcutsIgnored' | 'setThemeSurface'
    | 'submitQuickCapture'
  >,
  options: { onSettingsUpdated?: (settings: Awaited<ReturnType<typeof updateStoredSettings>>) => void } = {},
) {
  const ipcMain = {
    handle<T extends unknown[]>(
      channel: string,
      listener: (event: IpcMainInvokeEvent, ...args: T) => unknown,
    ) {
      electronIpcMain.handle(channel, (event, ...args: T) => {
        if (!windowManager.isTrustedIpcSender(event, channel)) {
          throw new Error(`Blocked untrusted IPC sender for ${channel}.`);
        }
        return listener(event, ...args);
      });
    },
  };
  const requests = createHackmdRequests();
  const runRequest = <const A extends unknown[], T>(
    event: IpcMainInvokeEvent,
    options: HackmdRequestOptions | undefined,
    method: (...args: NoInfer<[...A, AbortSignal?]>) => Promise<T>,
    args: A,
  ) => {
    const metadata = validateIpcInput('hackmd:request', hackmdRequestOptionsSchema, options);
    if (metadata) return requests.run(event.sender, metadata.requestId, signal => method(...args, signal));
    const parameters: [...A, AbortSignal?] = [...args];
    return method(...parameters);
  };
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCancelRequest, (event, requestId) => {
    const metadata = validateIpcInput(ELECTRON_CHANNELS.hackmdCancelRequest, hackmdRequestOptionsSchema, { requestId })!;
    requests.cancel(event.sender, metadata.requestId);
  });
  let localVaultWatcher: LocalVaultWatcher | null = null;
  let watchedLocalVaultPath: string | null = null;
  let localVaultWatcherGeneration = 0;

  const closeLocalVaultWatcher = (clearPath = false) => {
    localVaultWatcher?.close();
    localVaultWatcher = null;
    localVaultWatcherGeneration += 1;
    if (clearPath) {
      watchedLocalVaultPath = null;
    }
  };
  const ensureLocalVaultWatcher = (vaultPath: string) => {
    if (localVaultWatcher && watchedLocalVaultPath === vaultPath) {
      return;
    }

    closeLocalVaultWatcher();
    watchedLocalVaultPath = vaultPath;
    localVaultWatcher = watchLocalVault(vaultPath, (snapshot) => {
      windowManager.getMainWindow()?.webContents.send(ELECTRON_CHANNELS.localVaultDidChange, {
        snapshot,
      });
    });
  };
  const runLocalVaultMutation = async <T>(
    operation: () => Promise<T>,
    getSnapshot: (result: T) => LocalVaultSnapshot,
  ) => {
    const watcher = localVaultWatcher;
    const watcherGeneration = localVaultWatcherGeneration;
    let refreshOnResume = false;
    watcher?.pause();
    try {
      const result = await operation();
      if (localVaultWatcherGeneration !== watcherGeneration) {
        throw new Error('The active local vault changed while the operation was running.');
      }
      watchedLocalVaultPath = getSnapshot(result).rootPath;
      return result;
    } catch (error) {
      refreshOnResume = true;
      throw error;
    } finally {
      watcher?.resume(refreshOnResume);
      if (!watcher && localVaultWatcherGeneration === watcherGeneration && watchedLocalVaultPath) {
        ensureLocalVaultWatcher(watchedLocalVaultPath);
      }
    }
  };

  ipcMain.handle(ELECTRON_CHANNELS.settingsGet, () => getSafeSettings());
  ipcMain.handle(ELECTRON_CHANNELS.settingsUpdate, async (_event, settings) => {
    const nextSettings = await updateStoredSettings(validateIpcInput(ELECTRON_CHANNELS.settingsUpdate, settingsUpdateSchema, settings));
    clearHackmdCache();
    options.onSettingsUpdated?.(nextSettings);
    return nextSettings;
  });
  ipcMain.handle(ELECTRON_CHANNELS.settingsImportHackmdCliToken, async () => {
    const token = await readHackmdCliAccessToken();
    const user = await validateToken(token);
    const settings = await updateStoredSettings({ hackmdApiToken: token });
    clearHackmdCache();
    options.onSettingsUpdated?.(settings);
    return { settings, user };
  });
  ipcMain.handle(ELECTRON_CHANNELS.localVaultChoose, async () => {
    const targetWindow = windowManager.getTargetWindow();
    const result = targetWindow
      ? await dialog.showOpenDialog(targetWindow, {
        title: 'Choose Local Vault',
        properties: ['openDirectory', 'createDirectory'],
      })
      : await dialog.showOpenDialog({
        title: 'Choose Local Vault',
        properties: ['openDirectory', 'createDirectory'],
      });

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }

    const rootPath = result.filePaths[0];
    const snapshot = await scanLocalVault(rootPath);
    const settings = await updateStoredSettings({ localVaultPath: rootPath });
    options.onSettingsUpdated?.(settings);
    ensureLocalVaultWatcher(snapshot.rootPath);
    return { canceled: false, settings, snapshot };
  });
  ipcMain.handle(ELECTRON_CHANNELS.localVaultDisconnect, async () => {
    closeLocalVaultWatcher(true);
    const settings = await updateStoredSettings({ localVaultPath: null });
    options.onSettingsUpdated?.(settings);
    return settings;
  });
  ipcMain.handle(ELECTRON_CHANNELS.localVaultGetSnapshot, async () => {
    const snapshot = await getActiveLocalVaultSnapshot();
    if (snapshot) {
      ensureLocalVaultWatcher(snapshot.rootPath);
    }

    return snapshot;
  });
  ipcMain.handle(ELECTRON_CHANNELS.localVaultReadNote, (_event, noteId: string) => (
    readLocalNote(validateNonEmptyString(ELECTRON_CHANNELS.localVaultReadNote, noteId))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultCreateNote, (_event, input: LocalVaultCreateNoteInput) => (
    runLocalVaultMutation(
      () => createLocalNote(validateIpcInput(ELECTRON_CHANNELS.localVaultCreateNote, localVaultCreateNoteInputSchema, input)),
      (result) => result.snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultWriteNote, (_event, input: LocalVaultWriteInput) => (
    runLocalVaultMutation(
      () => writeLocalNote(validateIpcInput(ELECTRON_CHANNELS.localVaultWriteNote, localVaultWriteInputSchema, input)),
      (result) => result.snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultRenameNote, (_event, input: LocalVaultRenameNoteInput) => (
    runLocalVaultMutation(
      () => renameLocalNote(validateIpcInput(ELECTRON_CHANNELS.localVaultRenameNote, localVaultRenameNoteInputSchema, input)),
      (result) => result.snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultMoveNote, (_event, input: LocalVaultMoveNoteInput) => (
    runLocalVaultMutation(
      () => moveLocalNote(validateIpcInput(ELECTRON_CHANNELS.localVaultMoveNote, localVaultMoveNoteInputSchema, input)),
      (result) => result.snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultTrashNote, (_event, input: LocalVaultTrashNoteInput) => (
    runLocalVaultMutation(
      () => trashLocalNote(
        validateIpcInput(ELECTRON_CHANNELS.localVaultTrashNote, localVaultTrashNoteInputSchema, input),
        shell.trashItem,
      ),
      (snapshot) => snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultRevealNote, (_event, input: LocalVaultRevealNoteInput) => (
    revealLocalVaultNote(
      validateIpcInput(ELECTRON_CHANNELS.localVaultRevealNote, localVaultRevealNoteInputSchema, input),
      (path) => shell.showItemInFolder(path),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultImportAttachment, (_event, input: LocalVaultImportAttachmentInput) => (
    runLocalVaultMutation(
      () => importLocalVaultAttachment(
        validateIpcInput(ELECTRON_CHANNELS.localVaultImportAttachment, localVaultImportAttachmentInputSchema, input),
      ),
      (result) => result.snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultCreateFolder, (_event, input: LocalVaultCreateFolderInput) => (
    runLocalVaultMutation(
      () => createLocalFolder(validateIpcInput(ELECTRON_CHANNELS.localVaultCreateFolder, localVaultCreateFolderInputSchema, input)),
      (result) => result.snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultRenameFolder, (_event, input: LocalVaultRenameFolderInput) => (
    runLocalVaultMutation(
      () => renameLocalFolder(validateIpcInput(ELECTRON_CHANNELS.localVaultRenameFolder, localVaultRenameFolderInputSchema, input)),
      (result) => result.snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultMoveFolder, (_event, input: LocalVaultMoveFolderInput) => (
    runLocalVaultMutation(
      () => moveLocalFolder(validateIpcInput(ELECTRON_CHANNELS.localVaultMoveFolder, localVaultMoveFolderInputSchema, input)),
      (snapshot) => snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultTrashFolder, (_event, input: LocalVaultTrashFolderInput) => (
    runLocalVaultMutation(
      () => trashLocalFolder(
        validateIpcInput(ELECTRON_CHANNELS.localVaultTrashFolder, localVaultTrashFolderInputSchema, input),
        shell.trashItem,
      ),
      (snapshot) => snapshot,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultRevealFolder, (_event, input: LocalVaultRevealFolderInput) => (
    revealLocalVaultFolder(
      validateIpcInput(ELECTRON_CHANNELS.localVaultRevealFolder, localVaultRevealFolderInputSchema, input),
      (path) => shell.showItemInFolder(path),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultRevealRoot, () => (
    revealLocalVaultRoot((path) => shell.openPath(path))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdValidateToken, (event, token: string, options?: HackmdRequestOptions) => (
    runRequest(event, options, validateToken, [validateNonEmptyString(ELECTRON_CHANNELS.hackmdValidateToken, token)])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetCurrentUser, (event, options?: HackmdRequestOptions) => runRequest(event, options, getCurrentUser, []));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTeams, (event, options?: HackmdRequestOptions) => runRequest(event, options, listTeams, []));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListNotes, (event, options?: HackmdRequestOptions) => runRequest(event, options, listNotes, []));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTeamNotes, (event, teamPath: string, options?: HackmdRequestOptions) => (
    runRequest(event, options, listTeamNotes, [validateNonEmptyString(ELECTRON_CHANNELS.hackmdListTeamNotes, teamPath)])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListHistory, (event, limit?: number, options?: HackmdRequestOptions) => (
    runRequest(event, options, listHistory, [validateOptionalNumber(ELECTRON_CHANNELS.hackmdListHistory, limit)])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListFolders, (event, options?: HackmdRequestOptions) => runRequest(event, options, listFolders, []));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTeamFolders, (event, teamPath: string, options?: HackmdRequestOptions) => (
    runRequest(event, options, listTeamFolders, [validateNonEmptyString(ELECTRON_CHANNELS.hackmdListTeamFolders, teamPath)])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetFolder, (event, folderId: string, options?: HackmdRequestOptions) => (
    runRequest(event, options, getFolder, [validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetFolder, folderId)])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetTeamFolder, (event, teamPath: string, folderId: string, options?: HackmdRequestOptions) => (
    runRequest(event, options, getTeamFolder, [
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetTeamFolder, teamPath),
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetTeamFolder, folderId),
    ])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetFolderOrder, (event, options?: HackmdRequestOptions) => runRequest(event, options, getFolderOrder, []));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetTeamFolderOrder, (event, teamPath: string, options?: HackmdRequestOptions) => (
    runRequest(event, options, getTeamFolderOrder, [validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetTeamFolderOrder, teamPath)])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCreateFolder, (_event, input: CreateFolderInput) => (
    createFolder(validateIpcInput(ELECTRON_CHANNELS.hackmdCreateFolder, createFolderInputSchema, input))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCreateTeamFolder, (_event, teamPath: string, input: CreateFolderInput) => (
    createTeamFolder(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdCreateTeamFolder, teamPath),
      validateIpcInput(ELECTRON_CHANNELS.hackmdCreateTeamFolder, createFolderInputSchema, input),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateFolder, (_event, folderId: string, input: UpdateFolderInput) => (
    updateFolder(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdUpdateFolder, folderId),
      validateIpcInput(ELECTRON_CHANNELS.hackmdUpdateFolder, updateFolderInputSchema, input),
    )
  ));
  ipcMain.handle(
    ELECTRON_CHANNELS.hackmdUpdateTeamFolder,
    (_event, teamPath: string, folderId: string, input: UpdateFolderInput) => (
      updateTeamFolder(
        validateNonEmptyString(ELECTRON_CHANNELS.hackmdUpdateTeamFolder, teamPath),
        validateNonEmptyString(ELECTRON_CHANNELS.hackmdUpdateTeamFolder, folderId),
        validateIpcInput(ELECTRON_CHANNELS.hackmdUpdateTeamFolder, updateFolderInputSchema, input),
      )
    ),
  );
  ipcMain.handle(ELECTRON_CHANNELS.hackmdDeleteFolder, (_event, folderId: string) => (
    deleteFolder(validateNonEmptyString(ELECTRON_CHANNELS.hackmdDeleteFolder, folderId))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdDeleteTeamFolder, (_event, teamPath: string, folderId: string) => (
    deleteTeamFolder(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdDeleteTeamFolder, teamPath),
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdDeleteTeamFolder, folderId),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateFolderOrder, (_event, order: FolderOrder) => (
    updateFolderOrder(validateIpcInput(ELECTRON_CHANNELS.hackmdUpdateFolderOrder, folderOrderSchema, order))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateTeamFolderOrder, (_event, teamPath: string, order: FolderOrder) => (
    updateTeamFolderOrder(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdUpdateTeamFolderOrder, teamPath),
      validateIpcInput(ELECTRON_CHANNELS.hackmdUpdateTeamFolderOrder, folderOrderSchema, order),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetNote, (event, noteId: string, teamPath?: string | null, options?: HackmdRequestOptions) => (
    runRequest(event, options, getNote, [
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetNote, noteId),
      teamPath == null ? teamPath : validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetNote, teamPath),
    ])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetNoteIfChanged, (event, noteId: string, teamPath: string | null, etag: string, options?: HackmdRequestOptions) => (
    runRequest(event, options, getNoteIfChanged, [
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetNoteIfChanged, noteId),
      teamPath == null ? null : validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetNoteIfChanged, teamPath),
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetNoteIfChanged, etag),
    ])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCreateNote, (_event, input: CreateNoteInput) => (
    createNote(validateIpcInput(ELECTRON_CHANNELS.hackmdCreateNote, createNoteInputSchema, input))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCreateTeamNote, (_event, teamPath: string, input: CreateNoteInput) => (
    createTeamNote(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdCreateTeamNote, teamPath),
      validateIpcInput(ELECTRON_CHANNELS.hackmdCreateTeamNote, createNoteInputSchema, input),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateNote, (_event, noteId: string, input: UpdateNoteInput) => (
    updateNote(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdUpdateNote, noteId),
      validateIpcInput(ELECTRON_CHANNELS.hackmdUpdateNote, updateNoteInputSchema, input),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateTeamNote, (_event, teamPath: string, noteId: string, input: UpdateNoteInput) => (
    updateTeamNote(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdUpdateTeamNote, teamPath),
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdUpdateTeamNote, noteId),
      validateIpcInput(ELECTRON_CHANNELS.hackmdUpdateTeamNote, updateNoteInputSchema, input),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdDeleteNote, (_event, noteId: string) => (
    deleteNote(validateNonEmptyString(ELECTRON_CHANNELS.hackmdDeleteNote, noteId))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdRestoreNote, (_event, noteId: string) => (
    restoreNote(validateNonEmptyString(ELECTRON_CHANNELS.hackmdRestoreNote, noteId))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTrash, (event, options?: HackmdRequestOptions) => runRequest(event, options, listTrash, []));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdRestoreNotes, (_event, noteIds: string[]) => (
    restoreNotes(validateIpcInput(ELECTRON_CHANNELS.hackmdRestoreNotes, restoreNotesInputSchema, noteIds))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListNoteComments, (event, noteId: string, query: NoteCommentsQuery, options?: HackmdRequestOptions) => (
    runRequest(event, options, listNoteComments, [
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdListNoteComments, noteId),
      validateIpcInput(ELECTRON_CHANNELS.hackmdListNoteComments, noteCommentsQuerySchema, query),
    ])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdSetNoteCommentResolved, (_event, noteId: string, commentId: string, resolved: boolean) => (
    setNoteCommentResolved(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdSetNoteCommentResolved, noteId),
      validateIpcInput(ELECTRON_CHANNELS.hackmdSetNoteCommentResolved, noteCommentIdSchema, commentId),
      validateBoolean(ELECTRON_CHANNELS.hackmdSetNoteCommentResolved, resolved),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdDeleteTeamNote, (_event, teamPath: string, noteId: string) => (
    deleteTeamNote(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdDeleteTeamNote, teamPath),
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdDeleteTeamNote, noteId),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUploadNoteImage, (event, noteId: string, input: UploadNoteImageInput, options?: HackmdRequestOptions) => (
    runRequest(event, options, uploadNoteImage, [
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdUploadNoteImage, noteId),
      validateIpcInput(ELECTRON_CHANNELS.hackmdUploadNoteImage, uploadNoteImageInputSchema, input),
    ])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListNoteVersions, (event, noteId: string, query: NoteVersionsQuery, options?: HackmdRequestOptions) => (
    runRequest(event, options, listNoteVersions, [
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdListNoteVersions, noteId),
      validateIpcInput(ELECTRON_CHANNELS.hackmdListNoteVersions, noteVersionsQuerySchema, query),
    ])
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetNoteVersion, (event, noteId: string, versionId: string, options?: HackmdRequestOptions) => (
    runRequest(event, options, getNoteVersion, [
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetNoteVersion, noteId),
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetNoteVersion, versionId),
    ])
  ));
  ipcMain.handle(
    ELECTRON_CHANNELS.hackmdCompareNoteVersions,
    (event, noteId: string, base: NoteVersionRef, target: NoteVersionRef, options?: HackmdRequestOptions) => (
      runRequest(event, options, compareNoteVersions, [
        validateNonEmptyString(ELECTRON_CHANNELS.hackmdCompareNoteVersions, noteId),
        validateIpcInput(ELECTRON_CHANNELS.hackmdCompareNoteVersions, noteVersionRefSchema, base) as NoteVersionRef,
        validateIpcInput(ELECTRON_CHANNELS.hackmdCompareNoteVersions, noteVersionRefSchema, target) as NoteVersionRef,
      ])
    ),
  );
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCreateNoteVersion, (_event, noteId: string, input: CreateNoteVersionInput) => (
    createNoteVersion(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdCreateNoteVersion, noteId),
      validateIpcInput(ELECTRON_CHANNELS.hackmdCreateNoteVersion, createNoteVersionInputSchema, input),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.shellOpenExternal, (_event, url: string) => (
    openExternalUrl(validateNonEmptyString(ELECTRON_CHANNELS.shellOpenExternal, url))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.shellOpenHackmdEditor, (_event, note) => (
    openHackmdEditor(validateIpcInput(ELECTRON_CHANNELS.shellOpenHackmdEditor, openHackmdEditorInputSchema, note))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appExportDebugLogs, () => exportDebugLogs());
  ipcMain.handle(ELECTRON_CHANNELS.appRecordFatalRendererError, (_event, error: FatalRendererError) => (
    recordFatalRendererError(validateIpcInput(ELECTRON_CHANNELS.appRecordFatalRendererError, fatalRendererErrorSchema, error))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appConfirmClose, () => {
    windowManager.confirmClose();
  });
  ipcMain.handle(ELECTRON_CHANNELS.appCancelClose, () => {
    windowManager.cancelClose();
  });
  ipcMain.handle(ELECTRON_CHANNELS.appWriteClipboardText, (_event, text: string) => (
    clipboard.writeText(validateString(ELECTRON_CHANNELS.appWriteClipboardText, text))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appSaveTextFile, (_event, input: SaveTextFileInput) => (
    saveTextFile(validateIpcInput(ELECTRON_CHANNELS.appSaveTextFile, saveTextFileInputSchema, input), windowManager.getTargetWindow())
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appOpenTextFile, (_event, input: OpenTextFileInput) => (
    openTextFile(validateIpcInput(ELECTRON_CHANNELS.appOpenTextFile, openTextFileInputSchema, input), windowManager.getTargetWindow())
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appCheckForUpdates, () => checkForElectronUpdates(windowManager.getTargetWindow()));
  ipcMain.handle(ELECTRON_CHANNELS.appSetThemeSurface, (_event, input: ThemeSurfaceInput) => {
    const themeSurface = validateIpcInput(ELECTRON_CHANNELS.appSetThemeSurface, themeSurfaceInputSchema, input);
    windowManager.setThemeSurface(themeSurface.background);
  });
  ipcMain.handle(ELECTRON_CHANNELS.appSetMenuShortcutsIgnored, (_event, ignore: boolean) => {
    windowManager.setMenuShortcutsIgnored(
      validateBoolean(ELECTRON_CHANNELS.appSetMenuShortcutsIgnored, ignore),
    );
  });
  ipcMain.handle(ELECTRON_CHANNELS.appGetWindowPresentationState, () => (
    windowManager.getWindowPresentationState()
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appGetQuickCaptureShortcutStatus, () => getQuickCaptureShortcutStatus());
  ipcMain.handle(ELECTRON_CHANNELS.appSubmitQuickCapture, (_event, content: string) => (
    windowManager.submitQuickCapture(validateIpcInput(
      ELECTRON_CHANNELS.appSubmitQuickCapture,
      quickCaptureContentSchema,
      content,
    ))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appHideQuickCapture, () => {
    windowManager.hideQuickCaptureWindow();
  });
  ipcMain.handle(ELECTRON_CHANNELS.appResolveQuickCaptureSubmission, (_event, ack: QuickCaptureSubmissionAck) => {
    windowManager.resolveQuickCaptureSubmission(validateIpcInput(
      ELECTRON_CHANNELS.appResolveQuickCaptureSubmission,
      quickCaptureSubmissionAckSchema,
      ack,
    ));
  });
  ipcMain.handle(ELECTRON_CHANNELS.appConfirm, async (_event, options: ConfirmDialogOptions) => {
    const validatedOptions = validateIpcInput(ELECTRON_CHANNELS.appConfirm, confirmDialogOptionsSchema, options);
    const confirmLabel = validatedOptions.confirmLabel ?? 'OK';
    const cancelLabel = validatedOptions.cancelLabel ?? 'Cancel';
    const messageBoxOptions: MessageBoxOptions = {
      type: validatedOptions.destructive ? 'warning' : 'question',
      title: validatedOptions.title ?? app.getName(),
      message: validatedOptions.message,
      detail: validatedOptions.detail,
      buttons: [confirmLabel, cancelLabel],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    };
    const targetWindow = windowManager.getTargetWindow();
    const result = targetWindow
      ? await dialog.showMessageBox(targetWindow, messageBoxOptions)
      : await dialog.showMessageBox(messageBoxOptions);

    return { confirmed: result.response === 0 };
  });

  return {
    dispose: () => {
      requests.dispose();
      closeLocalVaultWatcher(true);
    },
  };
}
