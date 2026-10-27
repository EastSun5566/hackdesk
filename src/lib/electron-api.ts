import type {
  ChooseLocalVaultResult,
  LocalDocument,
  LocalVaultAttachmentMutationResult,
  LocalVaultChangeEvent,
  LocalVaultCreateFolderInput,
  LocalVaultCreateNoteInput,
  LocalVaultDocumentMutationResult,
  LocalVaultFolderMutationResult,
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
} from './local-vault';
import type { AiProviderId, AiProviderStatus, AiTurnInput } from './ai';
import type { DictationEvent, DictationInstallInput, DictationStartInput, DictationStatus } from './dictation';
import type {
  NoteBacklinksInput,
  NoteBacklinksResponse,
  NoteIndexStatus,
  NoteLinkTarget,
  NoteSearchInput,
  NoteSearchResponse,
  ResolveNoteLinkInput,
} from './note-index';
import type { AppSettings } from './settings';

export type RuntimeEnvironment = 'electron' | 'web';
export type HackmdRequestOptions = { requestId: string };

export type ElectronSafeSettings = Pick<AppSettings, 'title' | 'appearance' | 'editor' | 'workspaceNavigation'> & {
  hasHackmdApiToken: boolean;
  hackmdTokenStorageError?: string | null;
  hasAppearanceSettings?: boolean;
  hackmdCliConfig: HackmdCliConfigStatus;
  hasLocalVault: boolean;
  localVault: AppSettings['localVault'];
  onboarding: AppSettings['onboarding'];
  shortcuts?: AppSettings['shortcuts'];
  keyboardNavigation?: AppSettings['keyboardNavigation'];
  ai?: AppSettings['ai'];
  dictation?: AppSettings['dictation'];
  offline?: AppSettings['offline'];
  shouldShowHackmdOnboarding: boolean;
};

export type ElectronSettingsUpdate = Partial<Pick<AppSettings, 'title' | 'appearance' | 'editor' | 'shortcuts' | 'onboarding' | 'workspaceNavigation' | 'keyboardNavigation' | 'ai' | 'dictation' | 'offline'>> & {
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
  /** HackMD ETag of this content, for conditional reads. Absent for local notes and new notes. */
  etag?: string | null;
};

/** A saved HackMD version of a note. `user` versions were named by someone; `system` ones were saved automatically. */
export type NoteVersionSummary = {
  id: string;
  name: string;
  nameSource: 'user' | 'system';
  description: string | null;
  createdAtMillis: number | null;
  createdBy: { userId: string; displayName: string; photo: string | null } | null;
  contentAvailable: boolean;
};

export type NoteVersionDetail = NoteVersionSummary & {
  content: string | null;
};

export type NoteVersionPage = {
  versions: NoteVersionSummary[];
  page: number;
  totalPages: number;
  total: number;
};

/** The live note, or a saved version. */
export type NoteVersionRef = 'note_content' | `version:${string}`;

export type CreateNoteVersionInput = {
  name: string;
  description?: string;
  /** What to name: the live note (default) or an existing auto-saved version. */
  base?: NoteVersionRef;
};

/** New metadata for an already named version. An empty description removes it. */
export type UpdateNoteVersionInput = {
  name: string;
  description: string;
};

/**
 * HackMD answers 409 when there is nothing new to name, so those cases come
 * back as results the UI can explain instead of as errors.
 */
export type CreateNoteVersionResult =
  | { status: 'created'; version: NoteVersionSummary }
  | { status: 'no_content_change'; latestVersionId: string | null }
  | { status: 'version_already_named'; latestVersionId: string | null };

export type NoteCommentActor = {
  kind: 'user' | 'guest' | 'team' | 'deleted_user';
  displayName: string | null;
};

/** A span of the note's saved content, counted in characters. */
export type NoteCommentAnchor = { offset: number; length: number };

/** A HackMD comment or reply. Comments are plain text. */
export type NoteComment = {
  id: string;
  threadId: string;
  actor: NoteCommentActor;
  body: string;
  /** `hidden` with a reason such as `spam`, or `resolved` for a resolved thread. */
  status: 'open' | 'hidden';
  statusReason: string | null;
  isThreadHead: boolean;
  /** The whole thread's state. Only thread heads carry it. */
  threadStatus: 'open' | 'hidden' | null;
  threadStatusReason: string | null;
  anchor: NoteCommentAnchor | null;
  currentAnchor: NoteCommentAnchor | null;
  excerpt: string | null;
  createdAtMillis: number | null;
  updatedAtMillis: number | null;
};

export type NoteCommentPage = {
  comments: NoteComment[];
  page: number;
  hasNext: boolean;
};

export type NoteCommentsQuery = { page?: number };

/** HackMD answers 409 when the thread already has the requested state. */
export type NoteCommentResolutionResult = { status: 'updated' } | { status: 'conflict' };

/** A personal note in the HackMD trash. HackMD does not return its content. */
export type TrashedNoteSummary = {
  id: string;
  title: string;
  tags: string[];
  deletedAtMillis: number | null;
  /** When HackMD will delete the note for good, if it has scheduled that. */
  permanentDeleteAtMillis: number | null;
};

export type RestoreTrashFailureReason = 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INTERNAL_ERROR' | 'UNKNOWN';

/** One outcome per requested note id. A batch restore can partly succeed. */
export type RestoreTrashResult = Record<string, { status: 'success' } | { status: 'failure'; reason: RestoreTrashFailureReason }>;

export type NoteVersionsQuery = {
  namedOnly?: boolean;
  page?: number;
  limit?: number;
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
  | 'open-quick-open'
  | 'open-settings'
  | 'toggle-theme'
  | 'set-editor-mode-standard'
  | 'set-editor-mode-vim'
  | 'set-editor-mode-helix'
  | 'set-editor-mode-emacs'
  | 'set-editor-mode-kakoune'
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
  | 'show-keyboard-shortcuts'
  | 'focus-next-region'
  | 'focus-previous-region'
  | 'scroll-half-page-up'
  | 'scroll-half-page-down'
  | 'navigate-back'
  | 'navigate-forward'
  | 'export-debug-logs'
  | 'go-history'
  | 'show-trash'
  | 'focus-workspace'
  | 'focus-navigator'
  | 'focus-editor'
  | 'focus-inspector'
  | 'save-note'
  | 'find-in-note'
  | 'attach-image'
  | 'ai-assist'
  | 'dictate'
  | 'export-note-markdown'
  | 'import-markdown-note'
  | 'open-note-web-editor'
  | 'show-note-versions'
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
  | { type: ElectronActionId }
  | {
    type: 'quick-capture:create-draft';
    content: string;
    requestId: string;
    expiresAt: number;
  };

export type HackDeskCloseRequestSource = 'window-button' | 'app-quit';

export type HackDeskCloseRequest = {
  source: HackDeskCloseRequestSource;
};

export type ThemeSurfaceInput = {
  mode: 'dark' | 'light';
  background: string;
};

export type WindowPresentationState = {
  fullScreen: boolean;
};

export type QuickCaptureShortcutStatus = {
  accelerator: 'Control+Alt+H';
  registered: boolean;
};

export type QuickCaptureSubmissionAck =
  | { requestId: string; accepted: true }
  | { requestId: string; accepted: false; error: string };

export type QuickCaptureSubmitResult =
  | { accepted: true }
  | { accepted: false; error: string };

export type HackDeskElectronAPI = {
  getRuntimeEnvironment: () => RuntimeEnvironment;
  platform: string;
  settings: {
    get: () => Promise<ElectronSafeSettings>;
    update: (settings: ElectronSettingsUpdate) => Promise<ElectronSafeSettings>;
    importHackmdCliToken: () => Promise<ImportHackmdCliTokenResult>;
  };
  hackmd: {
    /** Optional for renderer hot reloads against an older preload. */
    cancelRequest?: (requestId: string) => Promise<void>;
    validateToken: (token: string, options?: HackmdRequestOptions) => Promise<UserSummary>;
    getCurrentUser: (options?: HackmdRequestOptions) => Promise<RepositoryValue<UserSummary>>;
    listTeams: (options?: HackmdRequestOptions) => Promise<RepositoryValue<TeamSummary[]>>;
    listNotes: (options?: HackmdRequestOptions) => Promise<RepositoryValue<NoteSummary[]>>;
    listTeamNotes: (teamPath: string, options?: HackmdRequestOptions) => Promise<RepositoryValue<NoteSummary[]>>;
    listHistory: (limit?: number, options?: HackmdRequestOptions) => Promise<RepositoryValue<NoteSummary[]>>;
    listFolders: (options?: HackmdRequestOptions) => Promise<RepositoryValue<FolderSummary[]>>;
    listTeamFolders: (teamPath: string, options?: HackmdRequestOptions) => Promise<RepositoryValue<FolderSummary[]>>;
    getFolder: (folderId: string, options?: HackmdRequestOptions) => Promise<RepositoryValue<FolderSummary>>;
    getTeamFolder: (teamPath: string, folderId: string, options?: HackmdRequestOptions) => Promise<RepositoryValue<FolderSummary>>;
    getFolderOrder: (options?: HackmdRequestOptions) => Promise<RepositoryValue<FolderOrder>>;
    getTeamFolderOrder: (teamPath: string, options?: HackmdRequestOptions) => Promise<RepositoryValue<FolderOrder>>;
    createFolder: (input: CreateFolderInput) => Promise<FolderSummary>;
    createTeamFolder: (teamPath: string, input: CreateFolderInput) => Promise<FolderSummary>;
    updateFolder: (folderId: string, input: UpdateFolderInput) => Promise<FolderSummary>;
    updateTeamFolder: (teamPath: string, folderId: string, input: UpdateFolderInput) => Promise<FolderSummary>;
    deleteFolder: (folderId: string) => Promise<void>;
    deleteTeamFolder: (teamPath: string, folderId: string) => Promise<void>;
    updateFolderOrder: (order: FolderOrder) => Promise<void>;
    updateTeamFolderOrder: (teamPath: string, order: FolderOrder) => Promise<void>;
    getNote: (noteId: string, teamPath?: string | null, options?: HackmdRequestOptions) => Promise<RepositoryValue<DocumentSummary>>;
    /** Resolves null when the note still matches `etag`. */
    getNoteIfChanged: (noteId: string, teamPath: string | null, etag: string, options?: HackmdRequestOptions) => Promise<DocumentSummary | null>;
    /** Finds the note a link names (a short ID, `@owner/permalink` or note URL); one API call. */
    resolveNote?: (ref: string, options?: HackmdRequestOptions) => Promise<{ noteId: string; teamPath: string | null; title: string; shortId: string }>;
    createNote: (input: CreateNoteInput) => Promise<DocumentSummary>;
    createTeamNote: (teamPath: string, input: CreateNoteInput) => Promise<DocumentSummary>;
    updateNote: (noteId: string, input: UpdateNoteInput) => Promise<DocumentSummary>;
    updateTeamNote: (teamPath: string, noteId: string, input: UpdateNoteInput) => Promise<DocumentSummary>;
    deleteNote: (noteId: string) => Promise<void>;
    restoreNote: (noteId: string) => Promise<void>;
    listTrash: (options?: HackmdRequestOptions) => Promise<TrashedNoteSummary[]>;
    restoreNotes: (noteIds: string[]) => Promise<RestoreTrashResult>;
    listNoteComments: (noteId: string, query: NoteCommentsQuery, options?: HackmdRequestOptions) => Promise<NoteCommentPage>;
    setNoteCommentResolved: (noteId: string, commentId: string, resolved: boolean) => Promise<NoteCommentResolutionResult>;
    deleteTeamNote: (teamPath: string, noteId: string) => Promise<void>;
    uploadNoteImage: (noteId: string, input: UploadNoteImageInput, options?: HackmdRequestOptions) => Promise<UploadNoteImageResult>;
    listNoteVersions: (noteId: string, query: NoteVersionsQuery, options?: HackmdRequestOptions) => Promise<NoteVersionPage>;
    getNoteVersion: (noteId: string, versionId: string, options?: HackmdRequestOptions) => Promise<NoteVersionDetail>;
    createNoteVersion: (noteId: string, input: CreateNoteVersionInput) => Promise<CreateNoteVersionResult>;
    updateNoteVersion: (noteId: string, versionId: string, input: UpdateNoteVersionInput) => Promise<NoteVersionSummary>;
    compareNoteVersions: (
      noteId: string,
      base: NoteVersionRef,
      target: NoteVersionRef,
      options?: HackmdRequestOptions,
    ) => Promise<{ unifiedDiff: string }>;
  };
  /** Optional for renderer hot reloads against an older preload. */
  ai?: {
    listProviders: () => Promise<AiProviderStatus[]>;
    refreshProvider: (providerId: AiProviderId) => Promise<AiProviderStatus>;
    /** Resolves with the whole answer; `onDelta` receives it as it streams. */
    runTurn: (input: AiTurnInput, onDelta: (text: string) => void) => Promise<string>;
    cancelTurn: (requestId: string) => Promise<void>;
    prewarm?: (providerId: AiProviderId) => Promise<void>;
  };
  /** Optional for renderer hot reloads against an older preload. */
  dictation?: {
    status: () => Promise<DictationStatus>;
    /** Resolves true once installed, or false when cancelled; `onEvent` receives progress. */
    install: (input: DictationInstallInput, onEvent: (event: DictationEvent) => void) => Promise<boolean>;
    /** Records until `stop`, then resolves with the transcript; null when cancelled. */
    start: (input: DictationStartInput, onEvent: (event: DictationEvent) => void) => Promise<string | null>;
    stop: (requestId: string) => Promise<void>;
    cancel: (requestId: string) => Promise<void>;
  };
  /** Optional for renderer hot reloads against an older preload. */
  noteIndex?: {
    /** Searches note text: every note of a Local Vault, or the HackMD notes opened before. */
    search: (input: NoteSearchInput) => Promise<NoteSearchResponse>;
    status: () => Promise<NoteIndexStatus>;
    /** Forgets the cached HackMD notes; the Local Vault index stays. */
    clear: () => Promise<NoteIndexStatus>;
    /** Finds the note a link points to from local data only; null when nothing here knows it. */
    resolveLink: (input: ResolveNoteLinkInput) => Promise<NoteLinkTarget | null>;
    /** Notes that link to `target`, from the Local Vault and the HackMD notes opened before. */
    backlinks: (input: NoteBacklinksInput) => Promise<NoteBacklinksResponse>;
  };
  localVault: {
    choose: () => Promise<ChooseLocalVaultResult>;
    disconnect: () => Promise<ElectronSafeSettings>;
    getSnapshot: () => Promise<LocalVaultSnapshot | null>;
    readNote: (noteId: string) => Promise<LocalDocument>;
    createNote: (input: LocalVaultCreateNoteInput) => Promise<LocalVaultDocumentMutationResult>;
    writeNote: (input: LocalVaultWriteInput) => Promise<LocalVaultDocumentMutationResult>;
    renameNote: (input: LocalVaultRenameNoteInput) => Promise<LocalVaultDocumentMutationResult>;
    moveNote: (input: LocalVaultMoveNoteInput) => Promise<LocalVaultDocumentMutationResult>;
    trashNote: (input: LocalVaultTrashNoteInput) => Promise<LocalVaultSnapshot>;
    revealNote: (input: LocalVaultRevealNoteInput) => Promise<void>;
    importAttachment: (input: LocalVaultImportAttachmentInput) => Promise<LocalVaultAttachmentMutationResult>;
    createFolder: (input: LocalVaultCreateFolderInput) => Promise<LocalVaultFolderMutationResult>;
    renameFolder: (input: LocalVaultRenameFolderInput) => Promise<LocalVaultFolderMutationResult>;
    moveFolder: (input: LocalVaultMoveFolderInput) => Promise<LocalVaultSnapshot>;
    trashFolder: (input: LocalVaultTrashFolderInput) => Promise<LocalVaultSnapshot>;
    revealFolder: (input: LocalVaultRevealFolderInput) => Promise<void>;
    revealRoot: () => Promise<void>;
    onDidChange: (callback: (event: LocalVaultChangeEvent) => void) => () => void;
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
    setMenuShortcutsIgnored?: (ignore: boolean) => Promise<void>;
    getWindowPresentationState?: () => Promise<WindowPresentationState>;
    onWindowPresentationStateChange?: (callback: (state: WindowPresentationState) => void) => () => void;
    getQuickCaptureShortcutStatus?: () => Promise<QuickCaptureShortcutStatus>;
    submitQuickCapture?: (content: string) => Promise<QuickCaptureSubmitResult>;
    hideQuickCapture?: () => Promise<void>;
    resolveQuickCaptureSubmission?: (ack: QuickCaptureSubmissionAck) => Promise<void>;
  };
};

export type HackDeskQuickCaptureAPI = {
  submit: (content: string) => Promise<QuickCaptureSubmitResult>;
  hide: () => Promise<void>;
};

export function getRuntimeEnvironment(): RuntimeEnvironment {
  if (typeof window !== 'undefined' && (window.hackdeskAPI || window.hackdeskQuickCaptureAPI)) {
    return 'electron';
  }

  return 'web';
}

export function getHackDeskAPI() {
  return typeof window === 'undefined' ? undefined : window.hackdeskAPI;
}
