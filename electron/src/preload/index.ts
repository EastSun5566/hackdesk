import { contextBridge, ipcRenderer } from 'electron';

import type {
  ConfirmDialogOptions,
  CreateFolderInput,
  CreateNoteInput,
  ElectronSettingsUpdate,
  FatalRendererError,
  FolderOrder,
  HackDeskCommandPaletteCommand,
  HackDeskElectronAPI,
  OpenHackmdEditorInput,
  UpdateFolderInput,
  UpdateNoteInput,
  UploadNoteImageInput,
} from '../../../src/lib/electron-api';
import { ELECTRON_CHANNELS } from '../shared/channels';

const api: HackDeskElectronAPI = {
  getRuntimeEnvironment: () => 'electron',
  settings: {
    get: () => ipcRenderer.invoke(ELECTRON_CHANNELS.settingsGet),
    update: (settings: ElectronSettingsUpdate) => ipcRenderer.invoke(ELECTRON_CHANNELS.settingsUpdate, settings),
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
    onCommand: (callback: (command: HackDeskCommandPaletteCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: HackDeskCommandPaletteCommand) => {
        callback(command);
      };

      ipcRenderer.on(ELECTRON_CHANNELS.appCommand, listener);
      return () => {
        ipcRenderer.removeListener(ELECTRON_CHANNELS.appCommand, listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld('hackdeskAPI', api);
