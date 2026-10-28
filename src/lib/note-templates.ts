import type { FolderTree, FolderTreeNode, FolderTreeNote } from './hackmd-folders';

/** Templates are the notes in a top-level folder with this name, in any workspace. */
export const TEMPLATES_FOLDER_NAME = 'Templates';

const isTemplatesName = (name: string) => name.trim().toLowerCase() === TEMPLATES_FOLDER_NAME.toLowerCase();

export function findTemplatesFolder(tree: FolderTree): FolderTreeNode | null {
  return tree.roots.find(folder => isTemplatesName(folder.name)) ?? null;
}

/** Every note in the Templates folder, including its subfolders, by title. */
export function listTemplates(tree: FolderTree): FolderTreeNote[] {
  return tree.allNotes
    .filter(entry => entry.folderPath[0] && entry.folderPath[0].parentId === null && isTemplatesName(entry.folderPath[0].name))
    .sort((left, right) => (left.note.title || '').localeCompare(right.note.title || ''));
}
