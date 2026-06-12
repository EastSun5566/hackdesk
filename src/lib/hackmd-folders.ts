import type { FolderOrder, FolderPathSummary, NoteSummary } from './electron-api';

export const UNFILED_FOLDER_ID = '__hackdesk_unfiled__';
export const ROOT_FOLDER_ORDER_KEY = 'root';

export type FolderTreeNote = {
  note: NoteSummary;
  folderLabel: string;
  folderPath: FolderPathSummary[];
};

export type FolderTreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  folderPath: FolderPathSummary[];
  children: FolderTreeNode[];
  notes: FolderTreeNote[];
};

export type FolderTree = {
  roots: FolderTreeNode[];
  nodesById: Map<string, FolderTreeNode>;
  unfiled: FolderTreeNode;
  allNotes: FolderTreeNote[];
};

function normalizeFolder(folder: FolderPathSummary): FolderPathSummary {
  return {
    ...folder,
    parentId: folder.parentId && folder.parentId !== folder.id ? folder.parentId : null,
  };
}

function createFolderNode(folder: FolderPathSummary): FolderTreeNode {
  return {
    id: folder.id,
    name: folder.name || 'Folder',
    parentId: folder.parentId,
    icon: folder.icon,
    color: folder.color,
    folderPath: [],
    children: [],
    notes: [],
  };
}

function compareFolderNodes(left: FolderTreeNode, right: FolderTreeNode, parentId: string | null, folderOrder?: FolderOrder) {
  const orderedIds = folderOrder?.[parentId ?? ROOT_FOLDER_ORDER_KEY] ?? [];
  const leftIndex = orderedIds.indexOf(left.id);
  const rightIndex = orderedIds.indexOf(right.id);

  if (leftIndex >= 0 && rightIndex >= 0 && leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }

  if (leftIndex >= 0) {
    return -1;
  }

  if (rightIndex >= 0) {
    return 1;
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function compareFolderTreeNotes(left: FolderTreeNote, right: FolderTreeNote) {
  return (right.note.updatedAtMillis ?? 0) - (left.note.updatedAtMillis ?? 0)
    || left.note.title.localeCompare(right.note.title, undefined, { sensitivity: 'base' });
}

function getFolderLabel(folderPath: FolderPathSummary[]) {
  return folderPath.map((folder) => folder.name).filter(Boolean).join(' / ');
}

function assignFolderPaths(node: FolderTreeNode, ancestors: FolderPathSummary[] = [], folderOrder?: FolderOrder) {
  const currentFolder: FolderPathSummary = {
    id: node.id,
    name: node.name,
    icon: node.icon,
    color: node.color,
    parentId: node.parentId,
    clientId: null,
  };
  const nextPath = node.id === UNFILED_FOLDER_ID ? [] : [...ancestors, currentFolder];

  node.folderPath = nextPath;
  node.children.sort((left, right) => compareFolderNodes(left, right, node.id, folderOrder));
  node.notes.sort(compareFolderTreeNotes);
  node.children.forEach((child) => assignFolderPaths(child, nextPath, folderOrder));
}

export function buildHackmdFolderTree(
  notes: NoteSummary[],
  folders: FolderPathSummary[] = [],
  folderOrder?: FolderOrder,
): FolderTree {
  const nodesById = new Map<string, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];
  const allNotes: FolderTreeNote[] = [];
  const unfiled = createFolderNode({
    id: UNFILED_FOLDER_ID,
    name: 'Root',
    icon: null,
    color: null,
    parentId: null,
    clientId: null,
  });

  const knownFolders = [
    ...folders,
    ...notes.flatMap((note) => note.folderPaths),
  ];

  for (const rawFolder of knownFolders) {
    const folder = normalizeFolder(rawFolder);

    if (!folder.id || nodesById.has(folder.id)) {
      continue;
    }

    nodesById.set(folder.id, createFolderNode(folder));
  }

  for (const node of nodesById.values()) {
    const parent = node.parentId ? nodesById.get(node.parentId) : null;

    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      node.parentId = null;
      roots.push(node);
    }
  }

  roots.sort((left, right) => compareFolderNodes(left, right, null, folderOrder));
  roots.forEach((root) => assignFolderPaths(root, [], folderOrder));
  assignFolderPaths(unfiled, [], folderOrder);

  for (const note of notes) {
    if (note.folderPaths.length === 0) {
      const treeNote = { note, folderLabel: '', folderPath: [] };
      unfiled.notes.push(treeNote);
      allNotes.push(treeNote);
      continue;
    }

    let targetNode: FolderTreeNode | null = null;
    for (let index = note.folderPaths.length - 1; index >= 0; index -= 1) {
      const node = nodesById.get(note.folderPaths[index].id);
      if (node) {
        targetNode = node;
        break;
      }
    }

    if (!targetNode) {
      const treeNote = { note, folderLabel: '', folderPath: [] };
      unfiled.notes.push(treeNote);
      allNotes.push(treeNote);
      continue;
    }

    const treeNote = {
      note,
      folderLabel: getFolderLabel(targetNode.folderPath) || targetNode.name,
      folderPath: targetNode.folderPath,
    };
    targetNode.notes.push(treeNote);
    allNotes.push(treeNote);
  }

  for (const node of nodesById.values()) {
    node.notes.sort(compareFolderTreeNotes);
  }

  unfiled.notes.sort(compareFolderTreeNotes);
  allNotes.sort(compareFolderTreeNotes);

  return {
    roots,
    nodesById,
    unfiled,
    allNotes,
  };
}
