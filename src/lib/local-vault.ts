export type LocalRevision = {
  contentHash: string;
  mtimeMs: number;
};

export type LocalFolder = {
  id: string;
  name: string;
  relativePath: string;
  parentPath: string | null;
  createdAtMillis: number | null;
  updatedAtMillis: number | null;
};

export type LocalNoteSummary = {
  id: string;
  title: string;
  relativePath: string;
  parentPath: string | null;
  createdAtMillis: number | null;
  updatedAtMillis: number | null;
  revision: LocalRevision;
};

export type LocalDocument = LocalNoteSummary & {
  content: string;
};

/** A Markdown file the scan left out, so the rest of the vault stays usable. */
export type LocalVaultSkippedFile = {
  relativePath: string;
  reason: string;
};

export type LocalVaultSnapshot = {
  vaultId: string;
  rootPath: string;
  scannedAtMillis?: number;
  notes: LocalNoteSummary[];
  folders: LocalFolder[];
  /** Absent from snapshots produced before files could be skipped. */
  skippedFiles?: LocalVaultSkippedFile[];
};

export type ChooseLocalVaultResult = {
  canceled: boolean;
  settings?: import('./electron-api').ElectronSafeSettings;
  snapshot?: LocalVaultSnapshot;
};

export type LocalDirectoryEntry = {
  name: string;
  path: string;
  hasSubdirectories: boolean;
};

export type LocalDirectoryBrowseResult = {
  path: string;
  parent: string | null;
  home: string;
  entries: LocalDirectoryEntry[];
};

/** What choosing a folder would read, for the confirmation before it is added. */
export type LocalVaultFolderMeasure = {
  path: string;
  name: string;
  notes: number;
  /** Past `limit` files and folders; the count stopped there. */
  exceedsLimit: boolean;
  limit: number;
};

export type LocalVaultChoosePathInput = {
  path: string;
};

export type LocalVaultVaultIdInput = {
  vaultId: string;
};

/** Edits a named working set of vault folders; folders themselves stay in the vault list. */
export type LocalWorkspaceMutation =
  | { type: 'create'; name: string; vaultIds: string[] }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'activate'; id: string | null }
  | { type: 'setVaults'; id: string; vaultIds: string[] };

export type LocalWorkspaceMutationResult = {
  settings: import('./electron-api').ElectronSafeSettings;
  snapshot: LocalVaultSnapshot | null;
};

export type LocalVaultActivateResult = {
  settings: import('./electron-api').ElectronSafeSettings;
  snapshot: LocalVaultSnapshot | null;
};

export type LocalVaultForgetResult = {
  settings: import('./electron-api').ElectronSafeSettings;
  snapshot: LocalVaultSnapshot | null;
};

export type LocalVaultCreateDirectoryInput = {
  parentPath: string;
  name: string;
};

export type LocalVaultCreateDirectoryResult = {
  path: string;
};

export type LocalVaultWriteInput = {
  noteId: string;
  title?: string;
  content: string;
  expectedRevision: LocalRevision;
};

export type LocalVaultCreateNoteInput = {
  title?: string;
  parentPath?: string | null;
  content?: string;
  /**
   * The folder the call is for: the manifest id its snapshots carry. With several windows open on
   * different folders, the app-wide active folder may belong to another window. Without it, the
   * active folder is used.
   */
  vaultId?: string;
};

export type LocalVaultRenameNoteInput = {
  noteId: string;
  title: string;
  expectedRevision?: LocalRevision;
};

export type LocalVaultMoveNoteInput = {
  noteId: string;
  parentPath: string | null;
  expectedRevision?: LocalRevision;
};

export type LocalVaultTrashNoteInput = {
  noteId: string;
};

export type LocalVaultRevealNoteInput = {
  noteId: string;
};

export type LocalVaultImportAttachmentInput = {
  noteId: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
};

export type LocalVaultImportAttachmentResult = {
  link: string;
  relativePath: string;
};

export type LocalVaultDocumentMutationResult = {
  document: LocalDocument;
  snapshot: LocalVaultSnapshot;
};

export type LocalVaultFolderMutationResult = {
  folder: LocalFolder;
  snapshot: LocalVaultSnapshot;
};

export type LocalVaultAttachmentMutationResult = {
  attachment: LocalVaultImportAttachmentResult;
  snapshot: LocalVaultSnapshot;
};

export type LocalVaultCreateFolderInput = {
  name: string;
  parentPath?: string | null;
  /**
   * The folder the call is for: the manifest id its snapshots carry. With several windows open on
   * different folders, the app-wide active folder may belong to another window. Without it, the
   * active folder is used.
   */
  vaultId?: string;
};

export type LocalVaultRenameFolderInput = {
  relativePath: string;
  name: string;
  /**
   * The folder the call is for: the manifest id its snapshots carry. With several windows open on
   * different folders, the app-wide active folder may belong to another window. Without it, the
   * active folder is used.
   */
  vaultId?: string;
};

export type LocalVaultMoveFolderInput = {
  relativePath: string;
  parentPath: string | null;
  /**
   * The folder the call is for: the manifest id its snapshots carry. With several windows open on
   * different folders, the app-wide active folder may belong to another window. Without it, the
   * active folder is used.
   */
  vaultId?: string;
};

export type LocalVaultTrashFolderInput = {
  relativePath: string;
  /**
   * The folder the call is for: the manifest id its snapshots carry. With several windows open on
   * different folders, the app-wide active folder may belong to another window. Without it, the
   * active folder is used.
   */
  vaultId?: string;
};

export type LocalVaultRevealFolderInput = {
  relativePath: string;
  /**
   * The folder the call is for: the manifest id its snapshots carry. With several windows open on
   * different folders, the app-wide active folder may belong to another window. Without it, the
   * active folder is used.
   */
  vaultId?: string;
};

/** A call addressed to a whole folder, such as revealing its root. */
export type LocalVaultFolderTargetInput = {
  /** The folder's manifest id; without it, the active folder. */
  vaultId?: string;
};

export type LocalVaultChangeEvent = {
  snapshot: LocalVaultSnapshot;
};
