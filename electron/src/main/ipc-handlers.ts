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

export function registerIpcHandlers(windowManager: WindowManager) {
  ipcMain.handle(ELECTRON_CHANNELS.settingsGet, () => getSafeSettings());
  ipcMain.handle(ELECTRON_CHANNELS.settingsUpdate, (_event, settings) => updateStoredSettings(settings));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdValidateToken, (_event, token: string) => validateToken(token));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetCurrentUser, () => getCurrentUser());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTeams, () => listTeams());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListNotes, () => listNotes());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTeamNotes, (_event, teamPath: string) => listTeamNotes(teamPath));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListHistory, (_event, limit?: number) => listHistory(limit));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListFolders, () => listFolders());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdListTeamFolders, (_event, teamPath: string) => listTeamFolders(teamPath));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetFolder, (_event, folderId: string) => getFolder(folderId));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetTeamFolder, (_event, teamPath: string, folderId: string) => (
    getTeamFolder(teamPath, folderId)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetFolderOrder, () => getFolderOrder());
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetTeamFolderOrder, (_event, teamPath: string) => getTeamFolderOrder(teamPath));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCreateFolder, (_event, input: CreateFolderInput) => createFolder(input));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCreateTeamFolder, (_event, teamPath: string, input: CreateFolderInput) => (
    createTeamFolder(teamPath, input)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateFolder, (_event, folderId: string, input: UpdateFolderInput) => (
    updateFolder(folderId, input)
  ));
  ipcMain.handle(
    ELECTRON_CHANNELS.hackmdUpdateTeamFolder,
    (_event, teamPath: string, folderId: string, input: UpdateFolderInput) => (
      updateTeamFolder(teamPath, folderId, input)
    ),
  );
  ipcMain.handle(ELECTRON_CHANNELS.hackmdDeleteFolder, (_event, folderId: string) => deleteFolder(folderId));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdDeleteTeamFolder, (_event, teamPath: string, folderId: string) => (
    deleteTeamFolder(teamPath, folderId)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateFolderOrder, (_event, order: FolderOrder) => (
    updateFolderOrder(order)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateTeamFolderOrder, (_event, teamPath: string, order: FolderOrder) => (
    updateTeamFolderOrder(teamPath, order)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdGetNote, (_event, noteId: string, teamPath?: string | null) => (
    getNote(noteId, teamPath)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCreateNote, (_event, input: CreateNoteInput) => createNote(input));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdCreateTeamNote, (_event, teamPath: string, input: CreateNoteInput) => (
    createTeamNote(teamPath, input)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateNote, (_event, noteId: string, input: UpdateNoteInput) => (
    updateNote(noteId, input)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUpdateTeamNote, (_event, teamPath: string, noteId: string, input: UpdateNoteInput) => (
    updateTeamNote(teamPath, noteId, input)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdDeleteNote, (_event, noteId: string) => deleteNote(noteId));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdDeleteTeamNote, (_event, teamPath: string, noteId: string) => (
    deleteTeamNote(teamPath, noteId)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.hackmdUploadNoteImage, (_event, noteId: string, input: UploadNoteImageInput) => (
    uploadNoteImage(noteId, input)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.shellOpenExternal, (_event, url: string) => openExternalUrl(url));
  ipcMain.handle(ELECTRON_CHANNELS.shellOpenHackmdEditor, (_event, note) => openHackmdEditor(note));
  ipcMain.handle(ELECTRON_CHANNELS.appExportDebugLogs, () => exportDebugLogs());
  ipcMain.handle(ELECTRON_CHANNELS.appRecordFatalRendererError, (_event, error: FatalRendererError) => (
    recordFatalRendererError(error)
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appWriteClipboardText, (_event, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle(ELECTRON_CHANNELS.appSaveTextFile, (_event, input: SaveTextFileInput) => (
    saveTextFile(input, windowManager.getTargetWindow())
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appOpenTextFile, (_event, input: OpenTextFileInput) => (
    openTextFile(input, windowManager.getTargetWindow())
  ));
  ipcMain.handle(ELECTRON_CHANNELS.appConfirm, async (_event, options: ConfirmDialogOptions) => {
    const confirmLabel = options.confirmLabel ?? 'OK';
    const cancelLabel = options.cancelLabel ?? 'Cancel';
    const result = await dialog.showMessageBox(windowManager.getTargetWindow() ?? undefined, {
      type: options.destructive ? 'warning' : 'question',
      title: options.title ?? app.getName(),
      message: options.message,
      detail: options.detail,
      buttons: [confirmLabel, cancelLabel],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });

    return { confirmed: result.response === 0 };
  });
}
