import type { ElectronActionDefinition } from './electron-actions';
import { noteMatchesFinderQuery, sortNoteFinderEntries } from './electron-note-finder';
import type { ElectronRecentNote } from './electron-recent-notes';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from './hackmd-folders';
import { UNFILED_FOLDER_ID } from './hackmd-folders';

export type QuickOpenFolderResult = {
  id: string;
  name: string;
  label: string;
  noteCount: number;
  ancestorIds: string[];
};

export const QUICK_OPEN_RESULT_LIMIT = 8;

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

function folderNoteCount(node: FolderTreeNode): number {
  return node.notes.length + node.children.reduce((total, child) => total + folderNoteCount(child), 0);
}

function flattenFolders(nodes: FolderTreeNode[], ancestorIds: string[] = []): QuickOpenFolderResult[] {
  return nodes.flatMap((node) => {
    const label = node.folderPath.map((folder) => folder.name).join(' / ') || node.name;
    return [
      {
        id: node.id,
        name: node.name,
        label,
        noteCount: folderNoteCount(node),
        ancestorIds,
      },
      ...flattenFolders(node.children, [...ancestorIds, node.id]),
    ];
  });
}

export function getQuickOpenNoteResults(tree: FolderTree, query: string, limit = QUICK_OPEN_RESULT_LIMIT): FolderTreeNote[] {
  const sortedNotes = sortNoteFinderEntries(tree.allNotes, 'updated-desc');
  const normalizedQuery = normalizeQuery(query);
  const notes = normalizedQuery
    ? sortedNotes.filter((entry) => noteMatchesFinderQuery(entry, normalizedQuery))
    : sortedNotes;

  return notes.slice(0, limit);
}

export function getQuickOpenFolderResults(tree: FolderTree, query: string, limit = QUICK_OPEN_RESULT_LIMIT): QuickOpenFolderResult[] {
  const root: QuickOpenFolderResult = {
    id: UNFILED_FOLDER_ID,
    name: 'Root',
    label: 'Root',
    noteCount: tree.unfiled.notes.length,
    ancestorIds: [],
  };
  const folders = [root, ...flattenFolders(tree.roots)];
  const normalizedQuery = normalizeQuery(query);
  const results = normalizedQuery
    ? folders.filter((folder) => `${folder.name} ${folder.label}`.toLowerCase().includes(normalizedQuery))
    : folders;

  return results.slice(0, limit);
}

export function shouldShowFinderQuickAction(query: string) {
  return normalizeQuery(query).length > 0;
}

export function getQuickOpenRecentNoteResults(recentNotes: ElectronRecentNote[], query: string, limit = QUICK_OPEN_RESULT_LIMIT) {
  if (normalizeQuery(query)) {
    return [];
  }

  return recentNotes.slice(0, limit);
}

export function getQuickOpenActionResults(actions: ElectronActionDefinition[], query: string, limit = QUICK_OPEN_RESULT_LIMIT) {
  const normalizedQuery = normalizeQuery(query);
  const results = normalizedQuery
    ? actions.filter((action) => [
      action.label,
      action.description,
      action.category,
      ...action.keywords,
    ].join(' ').toLowerCase().includes(normalizedQuery))
    : actions.filter((action) => action.category === 'create' || action.category === 'note' || action.category === 'folder' || action.category === 'view');

  return results.slice(0, limit);
}
