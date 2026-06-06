import { contextBridge, ipcRenderer } from 'electron';

import type {
  ConfirmDialogOptions,
  CreateNoteInput,
  ElectronSettingsUpdate,
  HackDeskCommandPaletteCommand,
  HackDeskElectronAPI,
  OpenHackmdEditorInput,
  UpdateNoteInput,
} from '../../../src/lib/electron-api';

const api: HackDeskElectronAPI = {
  getRuntimeEnvironment: () => 'electron',
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: ElectronSettingsUpdate) => ipcRenderer.invoke('settings:update', settings),
  },
  hackmd: {
    getCurrentUser: () => ipcRenderer.invoke('hackmd:get-current-user'),
    listTeams: () => ipcRenderer.invoke('hackmd:list-teams'),
    listNotes: () => ipcRenderer.invoke('hackmd:list-notes'),
    listTeamNotes: (teamPath: string) => ipcRenderer.invoke('hackmd:list-team-notes', teamPath),
    listHistory: (limit?: number) => ipcRenderer.invoke('hackmd:list-history', limit),
    getNote: (noteId: string, teamPath?: string | null) => ipcRenderer.invoke('hackmd:get-note', noteId, teamPath),
    createNote: (input: CreateNoteInput) => ipcRenderer.invoke('hackmd:create-note', input),
    createTeamNote: (teamPath: string, input: CreateNoteInput) => ipcRenderer.invoke('hackmd:create-team-note', teamPath, input),
    updateNote: (noteId: string, input: UpdateNoteInput) => ipcRenderer.invoke('hackmd:update-note', noteId, input),
    updateTeamNote: (teamPath: string, noteId: string, input: UpdateNoteInput) => ipcRenderer.invoke('hackmd:update-team-note', teamPath, noteId, input),
    deleteNote: (noteId: string) => ipcRenderer.invoke('hackmd:delete-note', noteId),
    deleteTeamNote: (teamPath: string, noteId: string) => ipcRenderer.invoke('hackmd:delete-team-note', teamPath, noteId),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    openHackmdEditor: (note: OpenHackmdEditorInput) => ipcRenderer.invoke('shell:open-hackmd-editor', note),
  },
  app: {
    confirm: (options: ConfirmDialogOptions) => ipcRenderer.invoke('app:confirm', options),
    onCommand: (callback: (command: HackDeskCommandPaletteCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: HackDeskCommandPaletteCommand) => {
        callback(command);
      };

      ipcRenderer.on('app:command', listener);
      return () => {
        ipcRenderer.removeListener('app:command', listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld('hackdeskAPI', api);
