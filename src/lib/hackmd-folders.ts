import type { FolderPathSummary, NoteSummary } from './electron-api';

export const UNFILED_FOLDER_ID = '__hackdesk_unfiled__';

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

function compareFolderNodes(left: FolderTreeNode, right: FolderTreeNode) {
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function compareFolderTreeNotes(left: FolderTreeNote, right: FolderTreeNote) {
  return (right.note.updatedAtMillis ?? 0) - (left.note.updatedAtMillis ?? 0)
    || left.note.title.localeCompare(right.note.title, undefined, { sensitivity: 'base' });
}

function getFolderLabel(folderPath: FolderPathSummary[]) {
  return folderPath.map((folder) => folder.name).filter(Boolean).join(' / ');
}

function assignFolderPaths(node: FolderTreeNode, ancestors: FolderPathSummary[] = []) {
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
  node.children.sort(compareFolderNodes);
  node.notes.sort(compareFolderTreeNotes);
  node.children.forEach((child) => assignFolderPaths(child, nextPath));
}

export function buildHackmdFolderTree(notes: NoteSummary[]): FolderTree {
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

  for (const note of notes) {
    for (const rawFolder of note.folderPaths) {
      const folder = normalizeFolder(rawFolder);

      if (!folder.id || nodesById.has(folder.id)) {
        continue;
      }

      nodesById.set(folder.id, createFolderNode(folder));
    }
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

  roots.sort(compareFolderNodes);
  roots.forEach((root) => assignFolderPaths(root));
  assignFolderPaths(unfiled);

  for (const note of notes) {
    if (note.folderPaths.length === 0) {
      const treeNote = { note, folderLabel: '', folderPath: [] };
      unfiled.notes.push(treeNote);
      allNotes.push(treeNote);
      continue;
    }

    const seenFolderIds = new Set<string>();

    for (const folderPath of note.folderPaths) {
      const node = nodesById.get(folderPath.id);

      if (!node || seenFolderIds.has(node.id)) {
        continue;
      }

      seenFolderIds.add(node.id);
      const treeNote = {
        note,
        folderLabel: getFolderLabel(node.folderPath) || node.name,
        folderPath: node.folderPath,
      };
      node.notes.push(treeNote);
      allNotes.push(treeNote);
    }

    if (seenFolderIds.size === 0) {
      const treeNote = { note, folderLabel: '', folderPath: [] };
      unfiled.notes.push(treeNote);
      allNotes.push(treeNote);
    }
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
