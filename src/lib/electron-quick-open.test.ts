import { describe, expect, it } from 'vitest';

import type { ElectronActionDefinition } from './electron-actions';
import type { FolderSummary, NoteSummary, TeamSummary } from './electron-api';
import {
  getQuickOpenActionResults,
  getQuickOpenFolderResults,
  getQuickOpenNoteResults,
  getQuickOpenRecentNoteResults,
  getQuickOpenWorkspaceResults,
  shouldShowFinderQuickAction,
} from './electron-quick-open';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from './hackmd-folders';

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    id: input.id,
    title: input.title,
    description: input.description ?? '',
    tags: input.tags ?? [],
    updatedAtMillis: input.updatedAtMillis ?? null,
    createdAtMillis: input.createdAtMillis ?? null,
    publishedAtMillis: input.publishedAtMillis ?? null,
    tagsUpdatedAtMillis: input.tagsUpdatedAtMillis ?? null,
    titleUpdatedAtMillis: input.titleUpdatedAtMillis ?? null,
    content: input.content ?? null,
    publishLink: input.publishLink ?? '',
    shortId: input.shortId ?? input.id,
    permalink: input.permalink ?? null,
    teamPath: input.teamPath ?? null,
    userPath: input.userPath ?? null,
    publishType: input.publishType ?? 'edit',
    readPermission: input.readPermission ?? 'owner',
    writePermission: input.writePermission ?? 'owner',
    lastChangeUser: input.lastChangeUser ?? null,
    folderPaths: input.folderPaths ?? [],
  };
}

const folder: FolderSummary = {
  id: 'folder-1',
  name: 'Projects',
  description: null,
  icon: null,
  color: null,
  parentId: null,
  clientId: null,
  createdAtMillis: 1,
  updatedAtMillis: 1,
};

const childFolder: FolderSummary = {
  ...folder,
  id: 'folder-2',
  name: 'Archive',
  parentId: 'folder-1',
};

const team: TeamSummary = {
  id: 'team-1',
  ownerId: null,
  name: 'Team Workspace',
  logo: null,
  path: 'team-workspace',
  description: null,
  visibility: 'private',
  createdAtMillis: 1,
  upgraded: false,
};

const actions: ElectronActionDefinition[] = [
  {
    id: 'new-note',
    label: 'New Note',
    description: 'Create a note.',
    keywords: ['create'],
    category: 'create',
  },
  {
    id: 'refresh',
    label: 'Refresh Notes',
    description: 'Reload notes.',
    keywords: ['sync'],
    category: 'navigation',
  },
  {
    id: 'rename-folder',
    label: 'Rename Folder',
    description: 'Rename selected folder.',
    keywords: ['directory'],
    category: 'folder',
  },
];

describe('electron quick open', () => {
  it('matches notes using finder query fields and sorts recent notes first', () => {
    const tree = buildHackmdFolderTree([
      note({ id: 'older', title: 'Older', tags: ['product'], updatedAtMillis: 1, folderPaths: [folder] }),
      note({ id: 'newer', title: 'Newer', description: 'Roadmap', updatedAtMillis: 2 }),
    ], [folder]);

    expect(getQuickOpenNoteResults(tree, '').map((entry) => entry.note.id)).toEqual(['newer', 'older']);
    expect(getQuickOpenNoteResults(tree, 'product').map((entry) => entry.note.id)).toEqual(['older']);
    expect(getQuickOpenNoteResults(tree, 'roadmap').map((entry) => entry.note.id)).toEqual(['newer']);
    expect(getQuickOpenNoteResults(tree, 'projects').map((entry) => entry.note.id)).toEqual(['older']);
  });

  it('flattens folders with labels, ancestor ids, and root mapping', () => {
    const tree = buildHackmdFolderTree([], [folder, childFolder]);
    const results = getQuickOpenFolderResults(tree, '');

    expect(results[0]).toMatchObject({
      id: UNFILED_FOLDER_ID,
      name: 'Root',
      label: 'Root',
      ancestorIds: [],
    });
    expect(results.find((result) => result.id === 'folder-2')).toMatchObject({
      name: 'Archive',
      label: 'Projects / Archive',
      ancestorIds: ['folder-1'],
    });
    expect(getQuickOpenFolderResults(tree, 'archive').map((result) => result.id)).toEqual(['folder-2']);
  });

  it('shows finder quick action only when query has text', () => {
    expect(shouldShowFinderQuickAction('')).toBe(false);
    expect(shouldShowFinderQuickAction('  ')).toBe(false);
    expect(shouldShowFinderQuickAction('roadmap')).toBe(true);
  });

  it('shows recent notes only when quick-open query is empty', () => {
    const recentNotes = [
      { noteId: 'one', teamPath: null, title: 'One', shortId: 'one', lastOpenedAtMillis: 2 },
      { noteId: 'two', teamPath: 'team', title: 'Two', shortId: 'two', lastOpenedAtMillis: 1 },
    ];

    expect(getQuickOpenRecentNoteResults(recentNotes, '').map((entry) => entry.noteId)).toEqual(['one', 'two']);
    expect(getQuickOpenRecentNoteResults(recentNotes, 'one')).toEqual([]);
  });

  it('lists and searches workspace switcher results', () => {
    expect(getQuickOpenWorkspaceResults([team], '').map((entry) => entry.id)).toEqual([
      'personal',
      'history',
      'team:team-workspace',
    ]);
    expect(getQuickOpenWorkspaceResults([team], 'history').map((entry) => entry.id)).toEqual(['history']);
    expect(getQuickOpenWorkspaceResults([team], 'team-workspace').map((entry) => entry.id)).toEqual(['team:team-workspace']);
  });

  it('filters actions by label, description, and keywords', () => {
    expect(getQuickOpenActionResults(actions, '').map((action) => action.id)).toEqual(['new-note', 'rename-folder']);
    expect(getQuickOpenActionResults(actions, 'sync').map((action) => action.id)).toEqual(['refresh']);
    expect(getQuickOpenActionResults(actions, 'create').map((action) => action.id)).toEqual(['new-note']);
  });
});
