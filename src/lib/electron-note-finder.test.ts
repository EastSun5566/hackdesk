import { describe, expect, it } from 'vitest';

import type { FolderSummary, NoteSummary } from './electron-api';
import {
  applyNoteFinder,
  clearNoteFinderFilters,
  clearNoteFinderQuery,
  DEFAULT_NOTE_FINDER_STATE,
  getActiveNoteFinderFilterCount,
  getNoteFinderStorageKey,
  hasActiveNoteFinderFilters,
  isNoteFinderActive,
  noteMatchesFinderQuery,
  readNoteFinderState,
  togglePermissionFilter,
  toggleStringFilter,
  writeNoteFinderState,
} from './electron-note-finder';
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

describe('electron note finder', () => {
  it('roundtrips state through storage with defaults for invalid fields', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } as Storage;

    expect(readNoteFinderState(storageLike, 'personal')).toEqual(DEFAULT_NOTE_FINDER_STATE);

    writeNoteFinderState(storageLike, 'personal', {
      query: 'roadmap',
      searchScope: 'current-folder',
      sortMode: 'title-asc',
      tagFilters: ['product', 'product', ''],
      readPermissionFilters: ['guest'],
      writePermissionFilters: ['owner'],
    });

    expect(storage.has(getNoteFinderStorageKey('personal'))).toBe(true);
    expect(readNoteFinderState(storageLike, 'personal')).toEqual({
      query: 'roadmap',
      searchScope: 'current-folder',
      sortMode: 'title-asc',
      tagFilters: ['product'],
      readPermissionFilters: ['guest'],
      writePermissionFilters: ['owner'],
    });
  });

  it('matches query across title, description, short id, team/user path, folder path, and tags', () => {
    const entry = buildHackmdFolderTree([
      note({
        id: 'note-1',
        title: 'Launch Plan',
        description: 'Quarterly roadmap',
        shortId: 'abc123',
        teamPath: 'design-team',
        userPath: 'michael',
        tags: ['product'],
        folderPaths: [folder],
      }),
    ]).allNotes[0];

    expect(noteMatchesFinderQuery(entry, 'launch')).toBe(true);
    expect(noteMatchesFinderQuery(entry, 'roadmap')).toBe(true);
    expect(noteMatchesFinderQuery(entry, 'abc123')).toBe(true);
    expect(noteMatchesFinderQuery(entry, 'design-team')).toBe(true);
    expect(noteMatchesFinderQuery(entry, 'michael')).toBe(true);
    expect(noteMatchesFinderQuery(entry, 'projects')).toBe(true);
    expect(noteMatchesFinderQuery(entry, 'product')).toBe(true);
    expect(noteMatchesFinderQuery(entry, 'missing')).toBe(false);
  });

  it('filters workspace or current folder entries', () => {
    const workspaceNote = note({ id: 'root-note', title: 'Root' });
    const folderNote = note({ id: 'folder-note', title: 'Folder', folderPaths: [folder] });
    const childNote = note({
      id: 'child-note',
      title: 'Child',
      folderPaths: [folder, childFolder],
    });
    const tree = buildHackmdFolderTree([workspaceNote, folderNote, childNote], [folder, childFolder]);

    expect(applyNoteFinder(tree, DEFAULT_NOTE_FINDER_STATE, folder.id).map((entry) => entry.note.id)).toEqual([
      'child-note',
      'folder-note',
      'root-note',
    ]);
    expect(applyNoteFinder(tree, { ...DEFAULT_NOTE_FINDER_STATE, searchScope: 'current-folder' }, folder.id).map((entry) => entry.note.id)).toEqual([
      'folder-note',
    ]);
    expect(applyNoteFinder(tree, { ...DEFAULT_NOTE_FINDER_STATE, searchScope: 'current-folder' }, UNFILED_FOLDER_ID).map((entry) => entry.note.id)).toEqual([
      'root-note',
    ]);
  });

  it('sorts by supported sort modes', () => {
    const tree = buildHackmdFolderTree([
      note({ id: 'b', title: 'Beta', updatedAtMillis: 2, createdAtMillis: 1 }),
      note({ id: 'a', title: 'Alpha', updatedAtMillis: 1, createdAtMillis: 3 }),
      note({ id: 'c', title: 'Charlie', updatedAtMillis: 3, createdAtMillis: 2 }),
    ]);

    expect(applyNoteFinder(tree, { ...DEFAULT_NOTE_FINDER_STATE, sortMode: 'updated-asc' }, null).map((entry) => entry.note.id)).toEqual(['a', 'b', 'c']);
    expect(applyNoteFinder(tree, { ...DEFAULT_NOTE_FINDER_STATE, sortMode: 'title-asc' }, null).map((entry) => entry.note.id)).toEqual(['a', 'b', 'c']);
    expect(applyNoteFinder(tree, { ...DEFAULT_NOTE_FINDER_STATE, sortMode: 'title-desc' }, null).map((entry) => entry.note.id)).toEqual(['c', 'b', 'a']);
    expect(applyNoteFinder(tree, { ...DEFAULT_NOTE_FINDER_STATE, sortMode: 'created-desc' }, null).map((entry) => entry.note.id)).toEqual(['a', 'c', 'b']);
  });

  it('combines filters as AND across categories and OR within a category', () => {
    const tree = buildHackmdFolderTree([
      note({ id: 'a', title: 'A', tags: ['product'], readPermission: 'guest', writePermission: 'owner' }),
      note({ id: 'b', title: 'B', tags: ['design'], readPermission: 'guest', writePermission: 'signed_in' }),
      note({ id: 'c', title: 'C', tags: ['engineering'], readPermission: 'owner', writePermission: 'owner' }),
    ]);

    const filtered = applyNoteFinder(tree, {
      ...DEFAULT_NOTE_FINDER_STATE,
      tagFilters: ['product', 'design'],
      readPermissionFilters: ['guest'],
      writePermissionFilters: ['owner'],
    }, null);

    expect(filtered.map((entry) => entry.note.id)).toEqual(['a']);
  });

  it('counts, toggles, and clears finder state', () => {
    const state = {
      ...DEFAULT_NOTE_FINDER_STATE,
      query: 'product',
      tagFilters: ['product'],
      readPermissionFilters: ['guest' as const],
      writePermissionFilters: ['owner' as const],
    };

    expect(isNoteFinderActive(DEFAULT_NOTE_FINDER_STATE)).toBe(false);
    expect(isNoteFinderActive(state)).toBe(true);
    expect(getActiveNoteFinderFilterCount(state)).toBe(3);
    expect(hasActiveNoteFinderFilters(state)).toBe(true);
    expect(clearNoteFinderQuery(state).query).toBe('');
    expect(clearNoteFinderFilters(state)).toMatchObject({
      tagFilters: [],
      readPermissionFilters: [],
      writePermissionFilters: [],
    });
    expect(toggleStringFilter(['product'], 'product')).toEqual([]);
    expect(toggleStringFilter([], 'product')).toEqual(['product']);
    expect(togglePermissionFilter(['guest'], 'guest')).toEqual([]);
    expect(togglePermissionFilter([], 'owner')).toEqual(['owner']);
  });
});
