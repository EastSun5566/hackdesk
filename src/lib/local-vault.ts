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

export type LocalVaultSnapshot = {
  vaultId: string;
  rootPath: string;
  scannedAtMillis?: number;
  notes: LocalNoteSummary[];
  folders: LocalFolder[];
};

export type ChooseLocalVaultResult = {
  canceled: boolean;
  settings?: import('./electron-api').ElectronSafeSettings;
  snapshot?: LocalVaultSnapshot;
};

export type LocalVaultWriteInput = {
  noteId: string;
  content: string;
  expectedRevision: LocalRevision;
};

export type LocalVaultCreateNoteInput = {
  title?: string;
  parentPath?: string | null;
  content?: string;
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

export type LocalVaultCreateFolderInput = {
  name: string;
  parentPath?: string | null;
};

export type LocalVaultRenameFolderInput = {
  relativePath: string;
  name: string;
};

export type LocalVaultMoveFolderInput = {
  relativePath: string;
  parentPath: string | null;
};

export type LocalVaultTrashFolderInput = {
  relativePath: string;
};

export type LocalVaultRevealFolderInput = {
  relativePath: string;
};

export type LocalVaultChangeEvent = {
  snapshot: LocalVaultSnapshot;
};
