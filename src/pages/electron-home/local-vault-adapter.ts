import type { DocumentSummary, FolderSummary, NoteSummary, RepositoryValue } from '@/lib/electron-api';
import type { LocalDocument, LocalFolder, LocalNoteSummary, LocalRevision, LocalVaultSnapshot } from '@/lib/local-vault';

export const LOCAL_VAULT_TEAM_PATH = '__hackdesk_local_vault__';

export type LocalDocumentSummary = DocumentSummary & {
  localRelativePath: string;
  localRevision: LocalRevision;
};

function getFolderId(relativePath: string) {
  return `local-folder:${relativePath}`;
}

function getFolderPath(snapshot: LocalVaultSnapshot, parentPath: string | null) {
  if (!parentPath) {
    return [];
  }

  const parts = parentPath.split('/');
  const paths: FolderSummary[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const relativePath = parts.slice(0, index + 1).join('/');
    const folder = snapshot.folders.find((candidate) => candidate.relativePath === relativePath);
    paths.push(toFolderSummary(folder ?? {
      id: getFolderId(relativePath),
      name: parts[index],
      relativePath,
      parentPath: index === 0 ? null : parts.slice(0, index).join('/'),
      createdAtMillis: null,
      updatedAtMillis: null,
    }));
  }

  return paths;
}

export function toFolderSummary(folder: LocalFolder): FolderSummary {
  return {
    id: folder.id,
    name: folder.name,
    description: null,
    icon: null,
    color: null,
    parentId: folder.parentPath ? getFolderId(folder.parentPath) : null,
    clientId: null,
    createdAtMillis: folder.createdAtMillis,
    updatedAtMillis: folder.updatedAtMillis,
  };
}

export function toNoteSummary(note: LocalNoteSummary, snapshot: LocalVaultSnapshot): NoteSummary {
  const folderPaths = getFolderPath(snapshot, note.parentPath);

  return {
    id: note.id,
    title: note.title,
    description: note.relativePath,
    tags: [],
    updatedAtMillis: note.updatedAtMillis,
    createdAtMillis: note.createdAtMillis,
    publishedAtMillis: null,
    tagsUpdatedAtMillis: null,
    titleUpdatedAtMillis: null,
    content: null,
    publishLink: '',
    shortId: note.relativePath,
    permalink: null,
    teamPath: LOCAL_VAULT_TEAM_PATH,
    userPath: null,
    publishType: 'view',
    readPermission: 'owner',
    writePermission: 'owner',
    lastChangeUser: null,
    folderPaths,
  };
}

export function toDocumentSummary(document: LocalDocument, snapshot: LocalVaultSnapshot): LocalDocumentSummary {
  return {
    ...toNoteSummary(document, snapshot),
    content: document.content,
    localRelativePath: document.relativePath,
    localRevision: document.revision,
  };
}

export function adaptLocalVaultSnapshot(snapshot: LocalVaultSnapshot | null) {
  const folders = snapshot?.folders.map(toFolderSummary) ?? [];
  const notes = snapshot?.notes.map((note) => toNoteSummary(note, snapshot)) ?? [];
  return { folders, notes };
}

export function localDocumentRepositoryValue(
  document: LocalDocument | undefined,
  snapshot: LocalVaultSnapshot | null | undefined,
): RepositoryValue<DocumentSummary> | undefined {
  if (!document || !snapshot) {
    return undefined;
  }

  return {
    source: 'remote',
    data: toDocumentSummary(document, snapshot),
  };
}

export function getLocalFolderPathFromFolderId(folderId: string | null | undefined) {
  if (!folderId || folderId === '__hackdesk_unfiled__') {
    return null;
  }

  return folderId.startsWith('local-folder:') ? folderId.slice('local-folder:'.length) : null;
}
