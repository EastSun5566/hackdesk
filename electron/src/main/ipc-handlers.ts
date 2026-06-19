import { app, clipboard, dialog, ipcMain } from 'electron';

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
  UploadNoteImageInput,
} from '../../../src/lib/electron-api';
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
import { getSafeSettings, updateStoredSettings } from './settings';
import { openExternalUrl, openHackmdEditor } from './url-policy';
import type { WindowManager } from './window-manager';
import { openTextFile, saveTextFile } from './app-file-dialog';
import { exportDebugLogs, recordFatalRendererError } from './logging';
import {
  confirmDialogOptionsSchema,
  createFolderInputSchema,
  createNoteInputSchema,
  fatalRendererErrorSchema,
  folderOrderSchema,
  openHackmdEditorInputSchema,
  openTextFileInputSchema,
  saveTextFileInputSchema,
  updateFolderInputSchema,
  updateNoteInputSchema,
  uploadNoteImageInputSchema,
  validateIpcInput,
  validateNonEmptyString,
  validateOptionalNumber,
  validateString,
} from './ipc-validation';

export function registerIpcHandlers(windowManager: WindowManager) {
  ipcMain.handle(ELECTRON_CHANNELS.settingsGet, () => getSafeSettings());
  ipcMain.handle(ELECTRON_CHANNELS.settingsUpdate, (_event, settings) => updateStoredSettings(settings));
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
  ipcMain.handle(ELECTRON_CHANNELS.appConfirm, async (_event, options: ConfirmDialogOptions) => {
    const validatedOptions = validateIpcInput(ELECTRON_CHANNELS.appConfirm, confirmDialogOptionsSchema, options);
    const confirmLabel = validatedOptions.confirmLabel ?? 'OK';
    const cancelLabel = validatedOptions.cancelLabel ?? 'Cancel';
    const result = await dialog.showMessageBox(windowManager.getTargetWindow() ?? undefined, {
      type: validatedOptions.destructive ? 'warning' : 'question',
      title: validatedOptions.title ?? app.getName(),
      message: validatedOptions.message,
      detail: validatedOptions.detail,
      buttons: [confirmLabel, cancelLabel],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });

    return { confirmed: result.response === 0 };
  });
}
