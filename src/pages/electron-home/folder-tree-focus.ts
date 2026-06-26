import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

export type TreeFocusItem = {
  depth: number;
  folderId?: string;
  hasChildren?: boolean;
  id: string;
  kind: 'folder' | 'note';
  label: string;
  note?: FolderTreeNote;
  parentFolderId: string | null;
};

export function createFolderFocusId(folderId: string) {
  return `folder:${folderId}`;
}

export function createNoteFocusId(noteId: string) {
  return `note:${noteId}`;
}

export function getFolderTreeFocusItems(tree: FolderTree, collapsedFolderIds: Set<string>): TreeFocusItem[] {
  const items: TreeFocusItem[] = [{
    depth: 0,
    folderId: UNFILED_FOLDER_ID,
    hasChildren: tree.unfiled.notes.length > 0 || tree.roots.length > 0,
    id: createFolderFocusId(UNFILED_FOLDER_ID),
    kind: 'folder',
    label: 'Root',
    parentFolderId: null,
  }];

  const appendFolder = (node: FolderTreeNode, parentFolderId: string | null, depth: number) => {
    const collapsed = collapsedFolderIds.has(node.id);
    items.push({
      depth,
      folderId: node.id,
      hasChildren: node.children.length > 0 || node.notes.length > 0,
      id: createFolderFocusId(node.id),
      kind: 'folder',
      label: node.name,
      parentFolderId,
    });

    if (collapsed) {
      return;
    }

    for (const child of node.children) {
      appendFolder(child, node.id, depth + 1);
    }

    for (const note of node.notes) {
      items.push({
        depth: depth + 1,
        id: createNoteFocusId(note.note.id),
        kind: 'note',
        label: note.note.title || 'Untitled',
        note,
        parentFolderId: node.id,
      });
    }
  };

  for (const node of tree.roots) {
    appendFolder(node, null, 0);
  }

  for (const note of tree.unfiled.notes) {
    items.push({
      depth: 1,
      id: createNoteFocusId(note.note.id),
      kind: 'note',
      label: note.note.title || 'Untitled',
      note,
      parentFolderId: UNFILED_FOLDER_ID,
    });
  }

  return items;
}

export function getKeyboardFocusRowId(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>('[data-folder-tree-row-id]')?.dataset.folderTreeRowId ?? null;
}

export function shouldIgnoreFolderTreeKeydown(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [data-folder-tree-ignore-keyboard]'));
}

export function normalizeCreateNoteFolderId(folderId: string | null) {
  return folderId === UNFILED_FOLDER_ID ? null : folderId;
}

export function findTypeaheadMatch(items: TreeFocusItem[], query: string, currentIndex: number) {
  if (!query) {
    return null;
  }

  const normalizedQuery = query.toLocaleLowerCase();
  const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;

  for (let offset = 0; offset < items.length; offset += 1) {
    const index = (startIndex + offset) % items.length;
    const item = items[index];
    if (item.label.toLocaleLowerCase().startsWith(normalizedQuery)) {
      return item;
    }
  }

  return null;
}
