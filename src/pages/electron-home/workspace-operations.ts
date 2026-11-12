import type {
  CreateFolderInput,
  CreateNoteInput,
  DocumentSummary,
  FolderSummary,
  HackDeskElectronAPI,
  NoteSummary,
  UpdateFolderInput,
  UpdateNoteInput,
  UploadNoteImageInput,
  UploadNoteImageResult,
} from '@/lib/electron-api';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';
import { runHackmdRequest } from '@/lib/hackmd-requests';
import type { LocalRevision, LocalVaultSnapshot } from '@/lib/local-vault';
import { TEMPLATES_FOLDER_NAME } from '@/lib/note-templates';

import {
  getLocalFolderPathFromFolderId,
  LOCAL_VAULT_TEAM_PATH,
  toDocumentSummary,
  toFolderSummary,
  toNoteSummary,
  type LocalDocumentSummary,
} from './local-vault-adapter';
import type { WorkspaceScope } from './types';

/**
 * What each workspace operation sends to the backend that stores it: a Local Vault folder on disk,
 * a HackMD workspace (My Workspace or a team), or nothing for History, which has no place of its
 * own to put notes or folders in.
 *
 * Operations on the workspace (create, folders, moves) follow the workspace on screen. Operations
 * on one note (save, upload, delete) follow where that note lives, whatever is on screen.
 */
export type WorkspaceOperations = {
  /** A quick note, from the new-note command. */
  createNote(input: NewNoteInput): Promise<DocumentSummary>;
  /** The first save of an unsaved draft. */
  createNoteFromDraft(input: NewNoteInput): Promise<DocumentSummary>;
  duplicateNote(note: NoteSummary): Promise<DocumentSummary>;
  /** Saves into the Templates folder, creating it when `templatesFolderId` is null. */
  saveTemplate(input: { title: string; content: string; templatesFolderId: string | null }): Promise<DocumentSummary>;
  importNote(input: NewNoteInput): Promise<DocumentSummary>;
  createFolder(input: NewFolderInput): Promise<FolderSummary>;
  renameFolder(folderId: string, input: UpdateFolderInput & { name: string }): Promise<FolderSummary>;
  deleteFolder(folderId: string): Promise<void>;
  moveFolder(operation: FolderDropOperation): Promise<void>;
  moveNote(note: NoteSummary, targetFolderId: string | null): Promise<NoteSummary>;
};

export type NoteOperations = {
  /** Remote saves of content check HackMD for newer changes first; local ones check the file revision. */
  readonly checksRemoteChanges: boolean;
  saveNote(note: NoteSummary, payload: UpdateNoteInput, draft?: SaveDraftBase): Promise<DocumentSummary>;
  uploadImage(note: NoteSummary, input: UploadNoteImageInput, signal?: AbortSignal): Promise<UploadNoteImageResult>;
  deleteNote(note: NoteSummary): Promise<void>;
};

export type NewNoteInput = Omit<CreateNoteInput, 'parentFolderId'> & { parentFolderId?: string | null };

export type NewFolderInput = Omit<CreateFolderInput, 'parentFolderId'> & { parentFolderId?: string | null };

/** What the save was based on, when it came from an editor draft. */
export type SaveDraftBase = { baseTitle?: string; baseRevision?: LocalRevision };

/** Called with each snapshot a Local Vault change returns, so the sidebar shows it at once. */
export type LocalSnapshotSink = (snapshot: LocalVaultSnapshot) => void;

type Backend = Omit<WorkspaceOperations, 'createNoteFromDraft' | 'importNote' | 'saveTemplate'>;

function localVaultBackend(localVault: HackDeskElectronAPI['localVault'], cacheSnapshot: LocalSnapshotSink): Backend & NoteOperations {
  const folderPath = (folderId: string) => getLocalFolderPathFromFolderId(folderId) ?? folderId;
  return {
    checksRemoteChanges: false,
    async createNote({ title, content, parentFolderId }) {
      const { document, snapshot } = await localVault.createNote({
        title,
        content,
        parentPath: getLocalFolderPathFromFolderId(parentFolderId),
      });
      cacheSnapshot(snapshot);
      return toDocumentSummary(document, snapshot);
    },
    async duplicateNote(note) {
      const source = await localVault.readNote(note.id);
      const { document, snapshot } = await localVault.createNote({
        title: `Copy of ${source.title.trim() || 'Untitled'}`,
        content: source.content,
        parentPath: source.parentPath,
      });
      cacheSnapshot(snapshot);
      return toDocumentSummary(document, snapshot);
    },
    async createFolder({ name, parentFolderId }) {
      const { folder, snapshot } = await localVault.createFolder({ name, parentPath: getLocalFolderPathFromFolderId(parentFolderId) });
      cacheSnapshot(snapshot);
      return toFolderSummary(folder);
    },
    async renameFolder(folderId, { name }) {
      const { folder, snapshot } = await localVault.renameFolder({ relativePath: folderPath(folderId), name });
      cacheSnapshot(snapshot);
      return toFolderSummary(folder);
    },
    async deleteFolder(folderId) {
      cacheSnapshot(await localVault.trashFolder({ relativePath: folderPath(folderId) }));
    },
    async moveFolder(operation) {
      // Local folders are ordered by file name, so only a new parent moves anything.
      if (!operation.parentChanged) return;
      const snapshot = await localVault.moveFolder({
        relativePath: folderPath(operation.folderId),
        parentPath: getLocalFolderPathFromFolderId(operation.parentFolderId),
      });
      if (snapshot) cacheSnapshot(snapshot);
    },
    async moveNote(note, targetFolderId) {
      const current = await localVault.readNote(note.id);
      const { document, snapshot } = await localVault.moveNote({
        noteId: note.id,
        parentPath: getLocalFolderPathFromFolderId(targetFolderId),
        expectedRevision: current.revision,
      });
      cacheSnapshot(snapshot);
      return toNoteSummary(document, snapshot);
    },
    async saveNote(note, payload, draft) {
      const local = note as LocalDocumentSummary;
      const titleChanged = payload.title !== undefined && payload.title !== (draft?.baseTitle ?? note.title);
      if (!titleChanged && payload.content === undefined) return local;
      const { document, snapshot } = await localVault.writeNote({
        noteId: note.id,
        ...(titleChanged ? { title: payload.title } : {}),
        content: payload.content ?? local.content,
        expectedRevision: draft?.baseRevision ?? local.localRevision,
      });
      cacheSnapshot(snapshot);
      return toDocumentSummary(document, snapshot);
    },
    async uploadImage(note, input) {
      const { attachment, snapshot } = await localVault.importAttachment({ noteId: note.id, ...input });
      cacheSnapshot(snapshot);
      return attachment;
    },
    async deleteNote(note) {
      cacheSnapshot(await localVault.trashNote({ noteId: note.id }));
    },
  };
}

/** A HackMD workspace: a team's when `teamPath` is set, otherwise My Workspace. */
function hackmdBackend(hackmd: HackDeskElectronAPI['hackmd'], teamPath: string | null): Backend & NoteOperations {
  const createNote = (input: CreateNoteInput) => (teamPath ? hackmd.createTeamNote(teamPath, input) : hackmd.createNote(input));
  const updateNote = (noteId: string, input: UpdateNoteInput) => (
    teamPath ? hackmd.updateTeamNote(teamPath, noteId, input) : hackmd.updateNote(noteId, input)
  );
  const updateFolder = (folderId: string, input: UpdateFolderInput) => (
    teamPath ? hackmd.updateTeamFolder(teamPath, folderId, input) : hackmd.updateFolder(folderId, input)
  );
  return {
    checksRemoteChanges: true,
    createNote({ parentFolderId, ...input }) {
      return createNote({ ...input, ...(parentFolderId ? { parentFolderId } : {}) });
    },
    async duplicateNote(note) {
      const result = await hackmd.getNote(note.id, note.teamPath ?? null);
      if (result.source === 'error') throw new Error(result.error);
      const source = result.data;
      const parentFolderId = source.folderPaths.at(-1)?.id;
      return createNote({
        title: `Copy of ${source.title.trim() || 'Untitled'}`,
        content: source.content,
        description: source.description,
        tags: source.tags,
        readPermission: source.readPermission,
        writePermission: source.writePermission,
        ...(parentFolderId ? { parentFolderId } : {}),
      });
    },
    createFolder({ parentFolderId, ...input }) {
      const payload = { ...input, ...(parentFolderId ? { parentFolderId } : {}) };
      return teamPath ? hackmd.createTeamFolder(teamPath, payload) : hackmd.createFolder(payload);
    },
    renameFolder(folderId, input) {
      return updateFolder(folderId, input);
    },
    async deleteFolder(folderId) {
      await (teamPath ? hackmd.deleteTeamFolder(teamPath, folderId) : hackmd.deleteFolder(folderId));
    },
    async moveFolder(operation) {
      if (operation.parentChanged) {
        await updateFolder(operation.folderId, { parentFolderId: operation.parentFolderId });
      }
      if (operation.orderChanged) {
        await (teamPath ? hackmd.updateTeamFolderOrder(teamPath, operation.order) : hackmd.updateFolderOrder(operation.order));
      }
    },
    moveNote(note, targetFolderId) {
      return updateNote(note.id, { parentFolderId: targetFolderId });
    },
    saveNote(note, payload) {
      return updateNote(note.id, payload);
    },
    uploadImage(note, input, signal) {
      return runHackmdRequest(hackmd, signal, hackmd.uploadNoteImage, [note.id, input]);
    },
    async deleteNote(note) {
      await (teamPath ? hackmd.deleteTeamNote(teamPath, note.id) : hackmd.deleteNote(note.id));
    },
  };
}

function withComposedOperations(backend: Backend): WorkspaceOperations {
  return {
    ...backend,
    createNoteFromDraft: backend.createNote,
    importNote: backend.createNote,
    async saveTemplate({ title, content, templatesFolderId }) {
      const parentFolderId = templatesFolderId ?? (await backend.createFolder({ name: TEMPLATES_FOLDER_NAME, parentFolderId: null })).id;
      return backend.createNote({ title, content, parentFolderId });
    },
  };
}

function refuse(action: string) {
  return async (): Promise<never> => {
    throw new Error(`Choose My Workspace or a team before ${action}.`);
  };
}

/**
 * History lists notes from every workspace and has none of its own. A quick note made there goes
 * to My Workspace; everything else that needs a place to put something is refused.
 */
function historyOperations(hackmd: HackDeskElectronAPI['hackmd']): WorkspaceOperations {
  return {
    createNote: hackmdBackend(hackmd, null).createNote,
    createNoteFromDraft: refuse('creating notes'),
    duplicateNote: refuse('duplicating notes'),
    saveTemplate: refuse('saving templates'),
    importNote: refuse('importing notes'),
    createFolder: refuse('creating a folder'),
    renameFolder: refuse('changing folders'),
    deleteFolder: refuse('deleting folders'),
    async moveFolder(operation) {
      if (operation.parentChanged) return refuse('changing folders')();
      if (operation.orderChanged) return refuse('changing folder order')();
    },
    moveNote: refuse('moving notes'),
  };
}

export function getWorkspaceOperations(
  api: HackDeskElectronAPI,
  scope: WorkspaceScope,
  cacheSnapshot: LocalSnapshotSink,
): WorkspaceOperations {
  switch (scope.type) {
    case 'local':
      return withComposedOperations(localVaultBackend(api.localVault, cacheSnapshot));
    case 'personal':
      return withComposedOperations(hackmdBackend(api.hackmd, null));
    case 'team':
      return withComposedOperations(hackmdBackend(api.hackmd, scope.teamPath));
    case 'history':
      return historyOperations(api.hackmd);
  }
}

export function isLocalVaultNote(scope: WorkspaceScope, note: Pick<NoteSummary, 'teamPath'>) {
  return scope.type === 'local' || note.teamPath === LOCAL_VAULT_TEAM_PATH;
}

/** The backend a note lives in: its Local Vault file, or its HackMD workspace. */
export function getNoteOperations(
  api: HackDeskElectronAPI,
  scope: WorkspaceScope,
  note: Pick<NoteSummary, 'teamPath'>,
  cacheSnapshot: LocalSnapshotSink,
): NoteOperations {
  return isLocalVaultNote(scope, note)
    ? localVaultBackend(api.localVault, cacheSnapshot)
    : hackmdBackend(api.hackmd, note.teamPath ?? null);
}
