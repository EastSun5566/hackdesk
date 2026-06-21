import type { NotePermissionRole } from './electron-api';
import type { FolderTree, FolderTreeNote } from './hackmd-folders';
import { UNFILED_FOLDER_ID } from './hackmd-folders';

export type NoteFinderSearchScope = 'workspace' | 'current-folder';
export type NoteFinderSortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc' | 'created-desc';

export type NoteFinderState = {
  query: string;
  searchScope: NoteFinderSearchScope;
  sortMode: NoteFinderSortMode;
  tagFilters: string[];
  readPermissionFilters: NotePermissionRole[];
  writePermissionFilters: NotePermissionRole[];
};

export type NoteFinderOptions = {
  tags: string[];
  readPermissions: NotePermissionRole[];
  writePermissions: NotePermissionRole[];
};

export const DEFAULT_NOTE_FINDER_STATE: NoteFinderState = {
  query: '',
  searchScope: 'workspace',
  sortMode: 'updated-desc',
  tagFilters: [],
  readPermissionFilters: [],
  writePermissionFilters: [],
};

const NOTE_FINDER_STORAGE_PREFIX = 'hackdesk_note_finder:';
const NOTE_PERMISSION_ROLES: NotePermissionRole[] = ['owner', 'signed_in', 'guest'];
const NOTE_FINDER_SORT_MODES: NoteFinderSortMode[] = ['updated-desc', 'updated-asc', 'title-asc', 'title-desc', 'created-desc'];

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))];
}

function uniquePermissionRoles(values: unknown[]) {
  return NOTE_PERMISSION_ROLES.filter((role) => values.includes(role));
}

export function getNoteFinderStorageKey(scopeKey: string) {
  return `${NOTE_FINDER_STORAGE_PREFIX}${scopeKey}`;
}

function normalizeNoteFinderState(value: unknown): NoteFinderState {
  if (!value || typeof value !== 'object') {
    return DEFAULT_NOTE_FINDER_STATE;
  }

  const candidate = value as Partial<NoteFinderState>;
  return {
    query: typeof candidate.query === 'string' ? candidate.query : '',
    searchScope: candidate.searchScope === 'current-folder' ? 'current-folder' : 'workspace',
    sortMode: candidate.sortMode && NOTE_FINDER_SORT_MODES.includes(candidate.sortMode)
      ? candidate.sortMode
      : DEFAULT_NOTE_FINDER_STATE.sortMode,
    tagFilters: uniqueStrings(Array.isArray(candidate.tagFilters) ? candidate.tagFilters : []),
    readPermissionFilters: uniquePermissionRoles(Array.isArray(candidate.readPermissionFilters) ? candidate.readPermissionFilters : []),
    writePermissionFilters: uniquePermissionRoles(Array.isArray(candidate.writePermissionFilters) ? candidate.writePermissionFilters : []),
  };
}

export function readNoteFinderState(storage: Storage, scopeKey: string) {
  try {
    return normalizeNoteFinderState(JSON.parse(storage.getItem(getNoteFinderStorageKey(scopeKey)) ?? 'null'));
  } catch {
    return DEFAULT_NOTE_FINDER_STATE;
  }
}

export function writeNoteFinderState(storage: Storage, scopeKey: string, state: NoteFinderState) {
  storage.setItem(getNoteFinderStorageKey(scopeKey), JSON.stringify(normalizeNoteFinderState(state)));
}

export function getActiveNoteFinderFilterCount(state: NoteFinderState) {
  return state.tagFilters.length + state.readPermissionFilters.length + state.writePermissionFilters.length;
}

export function hasActiveNoteFinderFilters(state: NoteFinderState) {
  return getActiveNoteFinderFilterCount(state) > 0;
}

export function isNoteFinderActive(state: NoteFinderState) {
  return state.query.trim().length > 0
    || state.searchScope !== DEFAULT_NOTE_FINDER_STATE.searchScope
    || state.sortMode !== DEFAULT_NOTE_FINDER_STATE.sortMode
    || hasActiveNoteFinderFilters(state);
}

export function clearNoteFinderQuery(state: NoteFinderState): NoteFinderState {
  return { ...state, query: '' };
}

export function clearNoteFinderFilters(state: NoteFinderState): NoteFinderState {
  return {
    ...state,
    tagFilters: [],
    readPermissionFilters: [],
    writePermissionFilters: [],
  };
}

export function toggleStringFilter(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export function togglePermissionFilter(values: NotePermissionRole[], value: NotePermissionRole) {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

export function noteMatchesFinderQuery(entry: FolderTreeNote, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const text = [
    entry.note.title,
    entry.note.description,
    entry.note.shortId,
    entry.note.teamPath,
    entry.note.userPath,
    entry.folderLabel,
    ...entry.note.tags,
  ].filter(Boolean).join(' ').toLowerCase();

  return text.includes(normalizedQuery);
}

function noteMatchesFilters(entry: FolderTreeNote, state: NoteFinderState) {
  const noteTags = new Set(entry.note.tags.map((tag) => tag.toLowerCase()));
  const tagMatch = state.tagFilters.length === 0
    || state.tagFilters.some((tag) => noteTags.has(tag.toLowerCase()));
  const readMatch = state.readPermissionFilters.length === 0
    || state.readPermissionFilters.includes(entry.note.readPermission);
  const writeMatch = state.writePermissionFilters.length === 0
    || state.writePermissionFilters.includes(entry.note.writePermission);

  return tagMatch && readMatch && writeMatch;
}

function compareNullableMillis(left: number | null, right: number | null) {
  return (left ?? 0) - (right ?? 0);
}

export function sortNoteFinderEntries(entries: FolderTreeNote[], sortMode: NoteFinderSortMode) {
  return [...entries].sort((left, right) => {
    switch (sortMode) {
    case 'updated-asc':
      return compareNullableMillis(left.note.updatedAtMillis, right.note.updatedAtMillis)
        || left.note.title.localeCompare(right.note.title, undefined, { sensitivity: 'base' });
    case 'title-asc':
      return left.note.title.localeCompare(right.note.title, undefined, { sensitivity: 'base' })
        || compareNullableMillis(right.note.updatedAtMillis, left.note.updatedAtMillis);
    case 'title-desc':
      return right.note.title.localeCompare(left.note.title, undefined, { sensitivity: 'base' })
        || compareNullableMillis(right.note.updatedAtMillis, left.note.updatedAtMillis);
    case 'created-desc':
      return compareNullableMillis(right.note.createdAtMillis, left.note.createdAtMillis)
        || left.note.title.localeCompare(right.note.title, undefined, { sensitivity: 'base' });
    case 'updated-desc':
    default:
      return compareNullableMillis(right.note.updatedAtMillis, left.note.updatedAtMillis)
        || left.note.title.localeCompare(right.note.title, undefined, { sensitivity: 'base' });
    }
  });
}

function getFinderBaseEntries(tree: FolderTree, state: NoteFinderState, selectedFolderId: string | null) {
  if (state.searchScope !== 'current-folder') {
    return tree.allNotes;
  }

  if (selectedFolderId === UNFILED_FOLDER_ID) {
    return tree.unfiled.notes;
  }

  return selectedFolderId ? tree.nodesById.get(selectedFolderId)?.notes ?? [] : tree.allNotes;
}

export function applyNoteFinder(tree: FolderTree, state: NoteFinderState, selectedFolderId: string | null) {
  const entries: FolderTreeNote[] = [];
  for (const entry of getFinderBaseEntries(tree, state, selectedFolderId)) {
    if (noteMatchesFinderQuery(entry, state.query) && noteMatchesFilters(entry, state)) {
      entries.push(entry);
    }
  }

  const seen = new Set<string>();
  return sortNoteFinderEntries(entries, state.sortMode).filter((entry) => {
    if (seen.has(entry.note.id)) {
      return false;
    }

    seen.add(entry.note.id);
    return true;
  });
}

export function getNoteFinderOptions(entries: FolderTreeNote[]): NoteFinderOptions {
  const tags = new Set<string>();
  const readPermissions = new Set<NotePermissionRole>();
  const writePermissions = new Set<NotePermissionRole>();

  for (const entry of entries) {
    entry.note.tags.forEach((tag) => tags.add(tag));
    readPermissions.add(entry.note.readPermission);
    writePermissions.add(entry.note.writePermission);
  }

  return {
    tags: [...tags].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
    readPermissions: NOTE_PERMISSION_ROLES.filter((role) => readPermissions.has(role)),
    writePermissions: NOTE_PERMISSION_ROLES.filter((role) => writePermissions.has(role)),
  };
}
