import { contextBridge, ipcRenderer } from 'electron';

import type {
  ConfirmDialogOptions,
  CreateFolderInput,
  CreateNoteInput,
  ElectronSettingsUpdate,
  FatalRendererError,
  FolderOrder,
  HackDeskCloseRequest,
  HackDeskCommandPaletteCommand,
  HackDeskElectronAPI,
  ThemeSurfaceInput,
  OpenTextFileInput,
  OpenHackmdEditorInput,
  SaveTextFileInput,
  UpdateFolderInput,
  UpdateNoteInput,
  UploadNoteImageInput,
} from '../../../src/lib/electron-api';
import type {
  LocalVaultChangeEvent,
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

const api: HackDeskElectronAPI = {
  getRuntimeEnvironment: () => 'electron',
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke(ELECTRON_CHANNELS.settingsGet),
    update: (settings: ElectronSettingsUpdate) => ipcRenderer.invoke(ELECTRON_CHANNELS.settingsUpdate, settings),
    importHackmdCliToken: () => ipcRenderer.invoke(ELECTRON_CHANNELS.settingsImportHackmdCliToken),
  },
  hackmd: {
    validateToken: (token: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdValidateToken, token),
    getCurrentUser: () => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdGetCurrentUser),
    listTeams: () => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdListTeams),
    listNotes: () => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdListNotes),
    listTeamNotes: (teamPath: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdListTeamNotes, teamPath),
    listHistory: (limit?: number) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdListHistory, limit),
    listFolders: () => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdListFolders),
    listTeamFolders: (teamPath: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdListTeamFolders, teamPath),
    getFolder: (folderId: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdGetFolder, folderId),
    getTeamFolder: (teamPath: string, folderId: string) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdGetTeamFolder, teamPath, folderId)
    ),
    getFolderOrder: () => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdGetFolderOrder),
    getTeamFolderOrder: (teamPath: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdGetTeamFolderOrder, teamPath),
    createFolder: (input: CreateFolderInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdCreateFolder, input),
    createTeamFolder: (teamPath: string, input: CreateFolderInput) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdCreateTeamFolder, teamPath, input)
    ),
    updateFolder: (folderId: string, input: UpdateFolderInput) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdUpdateFolder, folderId, input)
    ),
    updateTeamFolder: (teamPath: string, folderId: string, input: UpdateFolderInput) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdUpdateTeamFolder, teamPath, folderId, input)
    ),
    deleteFolder: (folderId: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdDeleteFolder, folderId),
    deleteTeamFolder: (teamPath: string, folderId: string) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdDeleteTeamFolder, teamPath, folderId)
    ),
    updateFolderOrder: (order: FolderOrder) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdUpdateFolderOrder, order),
    updateTeamFolderOrder: (teamPath: string, order: FolderOrder) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdUpdateTeamFolderOrder, teamPath, order)
    ),
    getNote: (noteId: string, teamPath?: string | null) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdGetNote, noteId, teamPath)
    ),
    createNote: (input: CreateNoteInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdCreateNote, input),
    createTeamNote: (teamPath: string, input: CreateNoteInput) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdCreateTeamNote, teamPath, input)
    ),
    updateNote: (noteId: string, input: UpdateNoteInput) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdUpdateNote, noteId, input)
    ),
    updateTeamNote: (teamPath: string, noteId: string, input: UpdateNoteInput) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdUpdateTeamNote, teamPath, noteId, input)
    ),
    deleteNote: (noteId: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdDeleteNote, noteId),
    deleteTeamNote: (teamPath: string, noteId: string) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdDeleteTeamNote, teamPath, noteId)
    ),
    uploadNoteImage: (noteId: string, input: UploadNoteImageInput) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.hackmdUploadNoteImage, noteId, input)
    ),
  },
  localVault: {
    choose: () => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultChoose),
    getSnapshot: () => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultGetSnapshot),
    readNote: (noteId: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultReadNote, noteId),
    createNote: (input: LocalVaultCreateNoteInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultCreateNote, input),
    writeNote: (input: LocalVaultWriteInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultWriteNote, input),
    renameNote: (input: LocalVaultRenameNoteInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultRenameNote, input),
    moveNote: (input: LocalVaultMoveNoteInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultMoveNote, input),
    trashNote: (input: LocalVaultTrashNoteInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultTrashNote, input),
    revealNote: (input: LocalVaultRevealNoteInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultRevealNote, input),
    importAttachment: (input: LocalVaultImportAttachmentInput) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultImportAttachment, input)
    ),
    createFolder: (input: LocalVaultCreateFolderInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultCreateFolder, input),
    renameFolder: (input: LocalVaultRenameFolderInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultRenameFolder, input),
    moveFolder: (input: LocalVaultMoveFolderInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultMoveFolder, input),
    trashFolder: (input: LocalVaultTrashFolderInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultTrashFolder, input),
    revealFolder: (input: LocalVaultRevealFolderInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultRevealFolder, input),
    revealRoot: () => ipcRenderer.invoke(ELECTRON_CHANNELS.localVaultRevealRoot),
    onDidChange: (callback: (event: LocalVaultChangeEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, event: LocalVaultChangeEvent) => {
        callback(event);
      };

      ipcRenderer.on(ELECTRON_CHANNELS.localVaultDidChange, listener);
      return () => {
        ipcRenderer.removeListener(ELECTRON_CHANNELS.localVaultDidChange, listener);
      };
    },
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.shellOpenExternal, url),
    openHackmdEditor: (note: OpenHackmdEditorInput) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.shellOpenHackmdEditor, note)
    ),
  },
  app: {
    confirm: (options: ConfirmDialogOptions) => ipcRenderer.invoke(ELECTRON_CHANNELS.appConfirm, options),
    exportDebugLogs: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appExportDebugLogs),
    recordFatalRendererError: (error: FatalRendererError) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.appRecordFatalRendererError, error)
    ),
    writeClipboardText: (text: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.appWriteClipboardText, text),
    saveTextFile: (input: SaveTextFileInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.appSaveTextFile, input),
    openTextFile: (input: OpenTextFileInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.appOpenTextFile, input),
    checkForUpdates: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appCheckForUpdates),
    setThemeSurface: (input: ThemeSurfaceInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.appSetThemeSurface, input),
    setMenuShortcutsIgnored: (ignore: boolean) => (
      ipcRenderer.invoke(ELECTRON_CHANNELS.appSetMenuShortcutsIgnored, ignore)
    ),
    getQuickCaptureShortcutStatus: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appGetQuickCaptureShortcutStatus),
    submitQuickCapture: (content: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.appSubmitQuickCapture, content),
    closeQuickCapture: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appCloseQuickCapture),
    onCommand: (callback: (command: HackDeskCommandPaletteCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: HackDeskCommandPaletteCommand) => {
        callback(command);
      };

      ipcRenderer.on(ELECTRON_CHANNELS.appCommand, listener);
      return () => {
        ipcRenderer.removeListener(ELECTRON_CHANNELS.appCommand, listener);
      };
    },
    onCloseRequest: (callback: (request: HackDeskCloseRequest) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, request: HackDeskCloseRequest) => {
        callback(request);
      };

      ipcRenderer.on(ELECTRON_CHANNELS.appCloseRequested, listener);
      return () => {
        ipcRenderer.removeListener(ELECTRON_CHANNELS.appCloseRequested, listener);
      };
    },
    confirmClose: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appConfirmClose),
    cancelClose: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appCancelClose),
  },
};

contextBridge.exposeInMainWorld('hackdeskAPI', api);
