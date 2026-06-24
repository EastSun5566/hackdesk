import type { AppSettings } from './settings';

export type RuntimeEnvironment = 'electron' | 'tauri' | 'web';

export type ElectronSafeSettings = Pick<AppSettings, 'title' | 'appearance'> & {
  hasHackmdApiToken: boolean;
  hasAppearanceSettings?: boolean;
  hackmdCliConfig: HackmdCliConfigStatus;
  onboarding: AppSettings['onboarding'];
  shouldShowHackmdOnboarding: boolean;
};

export type ElectronSettingsUpdate = Partial<Pick<AppSettings, 'title' | 'appearance' | 'onboarding'>> & {
  hackmdApiToken?: string;
};

export type HackmdCliConfigStatus = {
  hasAccessToken: boolean;
  hasCustomEndpoint: boolean;
};

export type ImportHackmdCliTokenResult = {
  settings: ElectronSafeSettings;
  user: UserSummary;
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

export type FolderSummary = FolderPathSummary & {
  description: string | null;
  createdAtMillis: number | null;
  updatedAtMillis: number | null;
};

export type FolderOrder = Record<string, string[]>;

export type SimpleUserProfile = {
  name: string;
  username: string;
  photo: string | null;
  biography: string | null;
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
export type CommentPermissionType = 'disabled' | 'forbidden' | 'owners' | 'signed_in_users' | 'everyone';
export type SuggestEditPermissionType = 'disabled' | 'forbidden' | 'owners' | 'signed_in_users';
export type NoteFeaturePermissions = Record<string, unknown>;

export type NoteSummary = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  updatedAtMillis: number | null;
  createdAtMillis: number | null;
  publishedAtMillis: number | null;
  tagsUpdatedAtMillis: number | null;
  titleUpdatedAtMillis: number | null;
  content: string | null;
  publishLink: string;
  shortId: string;
  permalink: string | null;
  teamPath: string | null;
  userPath: string | null;
  publishType: NotePublishType;
  readPermission: NotePermissionRole;
  writePermission: NotePermissionRole;
  lastChangeUser: SimpleUserProfile | null;
  folderPaths: FolderPathSummary[];
};

export type DocumentSummary = NoteSummary & {
  content: string;
};

export type CreateNoteInput = {
  title?: string;
  description?: string;
  tags?: string[];
  content?: string;
  readPermission?: NotePermissionRole;
  writePermission?: NotePermissionRole;
  commentPermission?: CommentPermissionType;
  suggestEditPermission?: SuggestEditPermissionType;
  noteFeatures?: NoteFeaturePermissions;
  permalink?: string;
  parentFolderId?: string;
  origin?: string;
};

export type UpdateNoteInput = {
  title?: string;
  content?: string;
  description?: string;
  tags?: string[];
  readPermission?: NotePermissionRole;
  writePermission?: NotePermissionRole;
  permalink?: string;
  parentFolderId?: string | null;
};

export type UploadNoteImageInput = {
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
};

export type UploadNoteImageResult = {
  link: string;
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

export type CheckForUpdatesResult =
  | { status: 'upToDate' }
  | { status: 'declined'; version: string }
  | { status: 'installed'; version: string; restart_required: boolean };

export type AppFileFilter = {
  name: string;
  extensions: string[];
};

export type SaveTextFileInput = {
  defaultFileName: string;
  content: string;
  filters?: AppFileFilter[];
};

export type OpenTextFileInput = {
  filters?: AppFileFilter[];
};

export type OpenTextFileResult = {
  filePath: string;
  fileName: string;
  content: string;
};

export type FatalRendererError = {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  platform: string;
};

export type CreateFolderInput = {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  parentFolderId?: string;
};

export type UpdateFolderInput = {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  parentFolderId?: string | null;
};

export type ElectronActionId =
  | 'open-command-palette'
  | 'open-settings'
  | 'toggle-theme'
  | 'new-tab'
  | 'new-note'
  | 'new-folder'
  | 'rename-folder'
  | 'delete-folder'
  | 'toggle-workspace-rail'
  | 'toggle-navigator'
  | 'toggle-inspector'
  | 'refresh'
  | 'search-notes'
  | 'navigate-back'
  | 'navigate-forward'
  | 'export-debug-logs'
  | 'go-history'
  | 'focus-workspace'
  | 'focus-navigator'
  | 'focus-editor'
  | 'focus-inspector'
  | 'save-note'
  | 'find-in-note'
  | 'export-note-markdown'
  | 'import-markdown-note'
  | 'open-note-web-editor'
  | 'delete-note'
  | 'close-tab'
  | 'close-other-tabs'
  | 'close-tabs-to-right'
  | 'reopen-last-closed-tab'
  | 'split-pane-right'
  | 'move-tab-to-other-pane'
  | 'focus-next-tab'
  | 'focus-previous-tab'
  | 'focus-next-pane'
  | 'focus-previous-pane';

export type HackDeskCommandPaletteCommand =
  { type: ElectronActionId };

export type HackDeskCloseRequestSource = 'window-button' | 'keyboard-shortcut';

export type HackDeskCloseRequest = {
  source: HackDeskCloseRequestSource;
};

export type ThemeSurfaceInput = {
  mode: 'dark' | 'light';
  background: string;
};

export type HackDeskElectronAPI = {
  getRuntimeEnvironment: () => RuntimeEnvironment;
  settings: {
    get: () => Promise<ElectronSafeSettings>;
    update: (settings: ElectronSettingsUpdate) => Promise<ElectronSafeSettings>;
    importHackmdCliToken: () => Promise<ImportHackmdCliTokenResult>;
  };
  hackmd: {
    validateToken: (token: string) => Promise<UserSummary>;
    getCurrentUser: () => Promise<RepositoryValue<UserSummary>>;
    listTeams: () => Promise<RepositoryValue<TeamSummary[]>>;
    listNotes: () => Promise<RepositoryValue<NoteSummary[]>>;
    listTeamNotes: (teamPath: string) => Promise<RepositoryValue<NoteSummary[]>>;
    listHistory: (limit?: number) => Promise<RepositoryValue<NoteSummary[]>>;
    listFolders: () => Promise<RepositoryValue<FolderSummary[]>>;
    listTeamFolders: (teamPath: string) => Promise<RepositoryValue<FolderSummary[]>>;
    getFolder: (folderId: string) => Promise<RepositoryValue<FolderSummary>>;
    getTeamFolder: (teamPath: string, folderId: string) => Promise<RepositoryValue<FolderSummary>>;
    getFolderOrder: () => Promise<RepositoryValue<FolderOrder>>;
    getTeamFolderOrder: (teamPath: string) => Promise<RepositoryValue<FolderOrder>>;
    createFolder: (input: CreateFolderInput) => Promise<FolderSummary>;
    createTeamFolder: (teamPath: string, input: CreateFolderInput) => Promise<FolderSummary>;
    updateFolder: (folderId: string, input: UpdateFolderInput) => Promise<FolderSummary>;
    updateTeamFolder: (teamPath: string, folderId: string, input: UpdateFolderInput) => Promise<FolderSummary>;
    deleteFolder: (folderId: string) => Promise<void>;
    deleteTeamFolder: (teamPath: string, folderId: string) => Promise<void>;
    updateFolderOrder: (order: FolderOrder) => Promise<void>;
    updateTeamFolderOrder: (teamPath: string, order: FolderOrder) => Promise<void>;
    getNote: (noteId: string, teamPath?: string | null) => Promise<RepositoryValue<DocumentSummary>>;
    createNote: (input: CreateNoteInput) => Promise<DocumentSummary>;
    createTeamNote: (teamPath: string, input: CreateNoteInput) => Promise<DocumentSummary>;
    updateNote: (noteId: string, input: UpdateNoteInput) => Promise<DocumentSummary>;
    updateTeamNote: (teamPath: string, noteId: string, input: UpdateNoteInput) => Promise<DocumentSummary>;
    deleteNote: (noteId: string) => Promise<void>;
    deleteTeamNote: (teamPath: string, noteId: string) => Promise<void>;
    uploadNoteImage: (noteId: string, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    openHackmdEditor: (note: OpenHackmdEditorInput) => Promise<void>;
  };
  app: {
    confirm: (options: ConfirmDialogOptions) => Promise<ConfirmDialogResult>;
    exportDebugLogs: () => Promise<string>;
    recordFatalRendererError: (error: FatalRendererError) => Promise<void>;
    writeClipboardText?: (text: string) => Promise<void>;
    saveTextFile: (input: SaveTextFileInput) => Promise<string | null>;
    openTextFile: (input: OpenTextFileInput) => Promise<OpenTextFileResult | null>;
    onCommand: (callback: (command: HackDeskCommandPaletteCommand) => void) => () => void;
    onCloseRequest: (callback: (request: HackDeskCloseRequest) => void) => () => void;
    confirmClose: () => Promise<void>;
    cancelClose: () => Promise<void>;
    checkForUpdates: () => Promise<CheckForUpdatesResult>;
    setThemeSurface?: (input: ThemeSurfaceInput) => Promise<void>;
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
