import type { ElectronActionDefinition } from './electron-actions';
import type { TeamSummary } from './electron-api';
import { sortNoteFinderEntries } from './electron-note-finder';
import type { ElectronRecentNote } from './electron-recent-notes';
import { fuzzySearch } from './fuzzy-search';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from './hackmd-folders';
import { UNFILED_FOLDER_ID } from './hackmd-folders';

export type QuickOpenFolderResult = {
  id: string;
  name: string;
  label: string;
  noteCount: number;
  ancestorIds: string[];
};

export type QuickOpenWorkspaceResult =
  | {
    id: 'personal';
    type: 'personal';
    label: string;
    description: string;
  }
  | {
    id: 'history';
    type: 'history';
    label: string;
    description: string;
  }
  | {
    id: `team:${string}`;
    type: 'team';
    label: string;
    description: string;
    teamPath: string;
  };

const QUICK_OPEN_RESULT_LIMIT = 8;

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

function compareUpdatedDesc(left: FolderTreeNote, right: FolderTreeNote) {
  return (right.note.updatedAtMillis ?? 0) - (left.note.updatedAtMillis ?? 0);
}

function getRecentNoteRank(note: FolderTreeNote, recentNotes: ElectronRecentNote[]) {
  const index = recentNotes.findIndex((recent) => (
    recent.noteId === note.note.id && recent.teamPath === (note.note.teamPath ?? null)
  ));
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function getNoteMetadata(entry: FolderTreeNote) {
  return [
    entry.folderLabel,
    entry.note.tags.join(' '),
    entry.note.shortId,
    entry.note.description,
    entry.note.teamPath,
    entry.note.userPath,
  ];
}

function compareQuickOpenNotes(recentNotes: ElectronRecentNote[]) {
  return (left: FolderTreeNote, right: FolderTreeNote) => {
    const leftRecentRank = getRecentNoteRank(left, recentNotes);
    const rightRecentRank = getRecentNoteRank(right, recentNotes);
    if (leftRecentRank !== rightRecentRank) {
      return leftRecentRank - rightRecentRank;
    }

    return compareUpdatedDesc(left, right);
  };
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

export function getQuickOpenNoteResults(
  tree: FolderTree,
  query: string,
  limit = QUICK_OPEN_RESULT_LIMIT,
  recentNotes: ElectronRecentNote[] = [],
): FolderTreeNote[] {
  const sortedNotes = sortNoteFinderEntries(tree.allNotes, 'updated-desc');
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return sortedNotes.slice(0, limit);
  }

  const notes = [...sortedNotes].sort(compareQuickOpenNotes(recentNotes));

  return fuzzySearch(notes, normalizedQuery, {
    primary: (entry) => entry.note.title || 'Untitled',
    secondary: getNoteMetadata,
  }).slice(0, limit);
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

  return fuzzySearch(folders, query, {
    primary: (folder) => [folder.name, folder.label],
  }).slice(0, limit);
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

export function getQuickOpenWorkspaceResults(teams: TeamSummary[], query: string, limit = QUICK_OPEN_RESULT_LIMIT): QuickOpenWorkspaceResult[] {
  const workspaces: QuickOpenWorkspaceResult[] = [
    {
      id: 'personal',
      type: 'personal',
      label: 'My Workspace',
      description: 'Personal HackMD notes and folders',
    },
    {
      id: 'history',
      type: 'history',
      label: 'History',
      description: 'Recently visited HackMD notes',
    },
    ...teams.map((team): QuickOpenWorkspaceResult => ({
      id: `team:${team.path}`,
      type: 'team',
      label: team.name || team.path,
      description: team.visibility === 'private' ? `Private team · ${team.path}` : `Public team · ${team.path}`,
      teamPath: team.path,
    })),
  ];
  return fuzzySearch(workspaces, query, {
    primary: (workspace) => workspace.label,
    secondary: (workspace) => [
      workspace.description,
      workspace.type,
      workspace.type === 'team' ? workspace.teamPath : '',
    ],
  }).slice(0, limit);
}

export function getQuickOpenActionResults(actions: ElectronActionDefinition[], query: string, limit = QUICK_OPEN_RESULT_LIMIT) {
  const normalizedQuery = normalizeQuery(query);
  const results = normalizedQuery
    ? fuzzySearch(actions, normalizedQuery, {
        primary: (action) => action.label,
        secondary: (action) => [action.description, action.category, ...action.keywords],
      })
    : actions.filter((action) => action.category === 'create' || action.category === 'note' || action.category === 'folder' || action.category === 'view');

  return results.slice(0, limit);
}
