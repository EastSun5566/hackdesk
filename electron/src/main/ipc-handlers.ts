import { app, clipboard, dialog, ipcMain, shell } from 'electron';
import type { MessageBoxOptions } from 'electron';

import type {
  ConfirmDialogOptions,
  CreateFolderInput,
  CreateNoteInput,
  FolderOrder,
  OpenTextFileInput,
  SaveTextFileInput,
  UpdateFolderInput,
  UpdateNoteInput,
  FatalRendererError,
  ThemeSurfaceInput,
  UploadNoteImageInput,
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
  getTeamFolder,
  getTeamFolderOrder,
  listFolders,
  listHistory,
  listNotes,
  listTeamFolders,
  listTeamNotes,
  listTeams,
  updateFolder,
  updateFolderOrder,
  updateNote,
  updateTeamFolder,
  updateTeamFolderOrder,
  updateTeamNote,
  uploadNoteImage,
  validateToken,
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
  saveTextFileInputSchema,
  settingsUpdateSchema,
  themeSurfaceInputSchema,
  updateFolderInputSchema,
  updateNoteInputSchema,
  uploadNoteImageInputSchema,
  validateIpcInput,
  validateBoolean,
  validateNonEmptyString,
  validateOptionalNumber,
  validateString,
} from './ipc-validation';

export function registerIpcHandlers(
  windowManager: WindowManager,
  options: { onSettingsUpdated?: (settings: Awaited<ReturnType<typeof updateStoredSettings>>) => void } = {},
) {
  let localVaultWatcher: LocalVaultWatcher | null = null;
  const startLocalVaultWatcher = (vaultPath: string) => {
    localVaultWatcher?.close();
    localVaultWatcher = watchLocalVault(vaultPath, (snapshot) => {
      windowManager.getTargetWindow()?.webContents.send(ELECTRON_CHANNELS.localVaultDidChange, {
        snapshot,
      });
    });
  };

  ipcMain.handle(ELECTRON_CHANNELS.settingsGet, () => getSafeSettings());
  ipcMain.handle(ELECTRON_CHANNELS.settingsUpdate, async (_event, settings) => {
    const nextSettings = await updateStoredSettings(validateIpcInput(ELECTRON_CHANNELS.settingsUpdate, settingsUpdateSchema, settings));
    options.onSettingsUpdated?.(nextSettings);
    return nextSettings;
  });
  ipcMain.handle(ELECTRON_CHANNELS.settingsImportHackmdCliToken, async () => {
    const token = await readHackmdCliAccessToken();
    const user = await validateToken(token);
    const settings = await updateStoredSettings({ hackmdApiToken: token });
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
    const settings = await updateStoredSettings({ localVault: { path: rootPath } });
    options.onSettingsUpdated?.(settings);
    startLocalVaultWatcher(rootPath);
    return { canceled: false, settings, snapshot };
  });
  ipcMain.handle(ELECTRON_CHANNELS.localVaultGetSnapshot, async () => {
    const snapshot = await getActiveLocalVaultSnapshot();
    if (snapshot) {
      startLocalVaultWatcher(snapshot.rootPath);
    }

    return snapshot;
  });
  ipcMain.handle(ELECTRON_CHANNELS.localVaultReadNote, (_event, noteId: string) => (
    readLocalNote(validateNonEmptyString(ELECTRON_CHANNELS.localVaultReadNote, noteId))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultCreateNote, (_event, input: LocalVaultCreateNoteInput) => (
    createLocalNote(validateIpcInput(ELECTRON_CHANNELS.localVaultCreateNote, localVaultCreateNoteInputSchema, input))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultWriteNote, (_event, input: LocalVaultWriteInput) => (
    writeLocalNote(validateIpcInput(ELECTRON_CHANNELS.localVaultWriteNote, localVaultWriteInputSchema, input))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultRenameNote, (_event, input: LocalVaultRenameNoteInput) => (
    renameLocalNote(validateIpcInput(ELECTRON_CHANNELS.localVaultRenameNote, localVaultRenameNoteInputSchema, input))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultMoveNote, (_event, input: LocalVaultMoveNoteInput) => (
    moveLocalNote(validateIpcInput(ELECTRON_CHANNELS.localVaultMoveNote, localVaultMoveNoteInputSchema, input))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultTrashNote, (_event, input: LocalVaultTrashNoteInput) => (
    trashLocalNote(
      validateIpcInput(ELECTRON_CHANNELS.localVaultTrashNote, localVaultTrashNoteInputSchema, input),
      shell.trashItem,
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultRevealNote, (_event, input: LocalVaultRevealNoteInput) => (
    revealLocalVaultNote(
      validateIpcInput(ELECTRON_CHANNELS.localVaultRevealNote, localVaultRevealNoteInputSchema, input),
      (path) => shell.showItemInFolder(path),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultImportAttachment, (_event, input: LocalVaultImportAttachmentInput) => (
    importLocalVaultAttachment(
      validateIpcInput(ELECTRON_CHANNELS.localVaultImportAttachment, localVaultImportAttachmentInputSchema, input),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultCreateFolder, (_event, input: LocalVaultCreateFolderInput) => (
    createLocalFolder(validateIpcInput(ELECTRON_CHANNELS.localVaultCreateFolder, localVaultCreateFolderInputSchema, input))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultRenameFolder, (_event, input: LocalVaultRenameFolderInput) => (
    renameLocalFolder(validateIpcInput(ELECTRON_CHANNELS.localVaultRenameFolder, localVaultRenameFolderInputSchema, input))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultMoveFolder, (_event, input: LocalVaultMoveFolderInput) => (
    moveLocalFolder(validateIpcInput(ELECTRON_CHANNELS.localVaultMoveFolder, localVaultMoveFolderInputSchema, input))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.localVaultTrashFolder, (_event, input: LocalVaultTrashFolderInput) => (
    trashLocalFolder(
      validateIpcInput(ELECTRON_CHANNELS.localVaultTrashFolder, localVaultTrashFolderInputSchema, input),
      shell.trashItem,
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
  ipcMain.handle(ELECTRON_CHANNELS.hackmdValidateToken, (_event, token: string) => (
    validateToken(validateNonEmptyString(ELECTRON_CHANNELS.hackmdValidateToken, token))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetCurrentUser, () => getCurrentUser());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTeams, () => listTeams());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListNotes, () => listNotes());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTeamNotes, (_event, teamPath: string) => (
    listTeamNotes(validateNonEmptyString(ELECTRON_CHANNELS.hackmdListTeamNotes, teamPath))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListHistory, (_event, limit?: number) => (
    listHistory(validateOptionalNumber(ELECTRON_CHANNELS.hackmdListHistory, limit))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListFolders, () => listFolders());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTeamFolders, (_event, teamPath: string) => (
    listTeamFolders(validateNonEmptyString(ELECTRON_CHANNELS.hackmdListTeamFolders, teamPath))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetFolder, (_event, folderId: string) => (
    getFolder(validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetFolder, folderId))
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetTeamFolder, (_event, teamPath: string, folderId: string) => (
    getTeamFolder(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetTeamFolder, teamPath),
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetTeamFolder, folderId),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetFolderOrder, () => getFolderOrder());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetTeamFolderOrder, (_event, teamPath: string) => (
    getTeamFolderOrder(validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetTeamFolderOrder, teamPath))
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
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetNote, (_event, noteId: string, teamPath?: string | null) => (
    getNote(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetNote, noteId),
      teamPath == null ? teamPath : validateNonEmptyString(ELECTRON_CHANNELS.hackmdGetNote, teamPath),
    )
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
  ipcMain.handle(ELECTRON_CHANNELS.hackmdDeleteTeamNote, (_event, teamPath: string, noteId: string) => (
    deleteTeamNote(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdDeleteTeamNote, teamPath),
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdDeleteTeamNote, noteId),
    )
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUploadNoteImage, (_event, noteId: string, input: UploadNoteImageInput) => (
    uploadNoteImage(
      validateNonEmptyString(ELECTRON_CHANNELS.hackmdUploadNoteImage, noteId),
      validateIpcInput(ELECTRON_CHANNELS.hackmdUploadNoteImage, uploadNoteImageInputSchema, input),
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
  ipcMain.handle(ELECTRON_CHANNELS.appWriteClipboardText, (_event, text: string) => {
    clipboard.writeText(validateString(ELECTRON_CHANNELS.appWriteClipboardText, text));
  });
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
  ipcMain.handle(ELECTRON_CHANNELS.appGetQuickCaptureShortcutStatus, () => getQuickCaptureShortcutStatus());
  ipcMain.handle(ELECTRON_CHANNELS.appSubmitQuickCapture, (_event, content: string) => {
    windowManager.submitQuickCapture(
      validateNonEmptyString(ELECTRON_CHANNELS.appSubmitQuickCapture, content),
    );
  });
  ipcMain.handle(ELECTRON_CHANNELS.appCloseQuickCapture, () => {
    windowManager.closeQuickCaptureWindow();
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
}
