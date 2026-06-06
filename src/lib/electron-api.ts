import type { AppSettings } from './settings';

export type RuntimeEnvironment = 'electron' | 'tauri' | 'web';

export type ElectronSafeSettings = Pick<AppSettings, 'title'> & {
  hasHackmdApiToken: boolean;
};

export type ElectronSettingsUpdate = Pick<AppSettings, 'title'> & {
  hackmdApiToken?: string;
};

export type RepositoryValue<T> =
  | { source: 'cached'; data: T }
  | { source: 'remote'; data: T }
  | { source: 'error'; error: string; data?: T };

export type FolderPathSummary = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  clientId: string | null;
};

export type TeamSummary = {
  id: string;
  ownerId: string | null;
  name: string;
  logo: string | null;
  path: string;
  description: string | null;
  visibility: 'public' | 'private';
  createdAtMillis: number | null;
  upgraded: boolean;
};

export type UserSummary = {
  id: string;
  email: string | null;
  name: string;
  username: string;
  photo: string | null;
  upgraded: boolean;
  teams: TeamSummary[];
};

export type NotePermissionRole = 'owner' | 'signed_in' | 'guest';
export type NotePublishType = 'edit' | 'view' | 'slide' | 'book';

export type NoteSummary = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  updatedAtMillis: number | null;
  createdAtMillis: number | null;
  content: string | null;
  publishLink: string;
  shortId: string;
  permalink: string | null;
  teamPath: string | null;
  userPath: string | null;
  publishType: NotePublishType;
  readPermission: NotePermissionRole;
  writePermission: NotePermissionRole;
  folderPaths: FolderPathSummary[];
};

export type DocumentSummary = NoteSummary & {
  content: string;
};

export type CreateNoteInput = {
  title: string;
  content: string;
  parentFolderId?: string;
};

export type UpdateNoteInput = {
  title?: string;
  content?: string;
  description?: string;
  tags?: string[];
  readPermission?: NotePermissionRole;
  writePermission?: NotePermissionRole;
  parentFolderId?: string;
};

export type OpenHackmdEditorInput = Pick<
  NoteSummary,
  'publishType' | 'shortId' | 'userPath' | 'teamPath' | 'permalink' | 'publishLink'
>;

export type ConfirmDialogOptions = {
  title?: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type ConfirmDialogResult = {
  confirmed: boolean;
};

export type HackDeskCommandPaletteCommand =
  | { type: 'open-command-palette' }
  | { type: 'open-settings' }
  | { type: 'new-note' };

export type HackDeskElectronAPI = {
  getRuntimeEnvironment: () => RuntimeEnvironment;
  settings: {
    get: () => Promise<ElectronSafeSettings>;
    update: (settings: ElectronSettingsUpdate) => Promise<ElectronSafeSettings>;
  };
  hackmd: {
    getCurrentUser: () => Promise<RepositoryValue<UserSummary>>;
    listTeams: () => Promise<RepositoryValue<TeamSummary[]>>;
    listNotes: () => Promise<RepositoryValue<NoteSummary[]>>;
    listTeamNotes: (teamPath: string) => Promise<RepositoryValue<NoteSummary[]>>;
    listHistory: (limit?: number) => Promise<RepositoryValue<NoteSummary[]>>;
    getNote: (noteId: string, teamPath?: string | null) => Promise<RepositoryValue<DocumentSummary>>;
    createNote: (input: CreateNoteInput) => Promise<DocumentSummary>;
    createTeamNote: (teamPath: string, input: CreateNoteInput) => Promise<DocumentSummary>;
    updateNote: (noteId: string, input: UpdateNoteInput) => Promise<DocumentSummary>;
    updateTeamNote: (teamPath: string, noteId: string, input: UpdateNoteInput) => Promise<DocumentSummary>;
    deleteNote: (noteId: string) => Promise<void>;
    deleteTeamNote: (teamPath: string, noteId: string) => Promise<void>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    openHackmdEditor: (note: OpenHackmdEditorInput) => Promise<void>;
  };
  app: {
    confirm: (options: ConfirmDialogOptions) => Promise<ConfirmDialogResult>;
    onCommand: (callback: (command: HackDeskCommandPaletteCommand) => void) => () => void;
  };
};

export function getRuntimeEnvironment(): RuntimeEnvironment {
  if (typeof window !== 'undefined' && window.hackdeskAPI) {
    return 'electron';
  }

  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return 'tauri';
  }

  return 'web';
}

export function getHackDeskAPI() {
  return typeof window === 'undefined' ? undefined : window.hackdeskAPI;
}
