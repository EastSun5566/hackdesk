import { describe, expect, it } from 'vitest';

import type { NoteSummary } from './electron-api';
import {
  ELECTRON_RECENT_NOTES_LIMIT,
  ELECTRON_RECENT_NOTES_STORAGE_KEY,
  normalizeRecentNotes,
  readRecentNotes,
  recentNoteMatches,
  removeRecentNote,
  upsertRecentNote,
  writeRecentNotes,
} from './electron-recent-notes';

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id'>): NoteSummary {
  return {
    id: input.id,
    title: input.title ?? 'Untitled',
    description: '',
    tags: [],
    updatedAtMillis: 1,
    createdAtMillis: 1,
    publishedAtMillis: null,
    tagsUpdatedAtMillis: null,
    titleUpdatedAtMillis: null,
    content: null,
    publishLink: null,
    shortId: input.shortId ?? input.id,
    permalink: null,
    teamPath: input.teamPath ?? null,
    userPath: input.teamPath ? null : 'michael',
    publishType: 'edit',
    readPermission: 'guest',
    writePermission: 'owner',
    lastChangeUser: null,
    folderPaths: [],
  };
}

describe('electron recent notes', () => {
  it('normalizes, dedupes, sorts, and limits recent note entries', () => {
    const normalized = normalizeRecentNotes([
      { noteId: 'older', teamPath: null, title: 'Older', shortId: 'older', lastOpenedAtMillis: 1 },
      { noteId: 'newer', teamPath: 'team', title: 'Newer', shortId: 'newer', lastOpenedAtMillis: 3 },
      { noteId: 'older', teamPath: null, title: 'Duplicate', shortId: 'dup', lastOpenedAtMillis: 9 },
      { noteId: '', title: 'Invalid' },
      ...Array.from({ length: ELECTRON_RECENT_NOTES_LIMIT + 2 }, (_, index) => ({
        noteId: `extra-${index}`,
        teamPath: null,
        title: `Extra ${index}`,
        shortId: `extra-${index}`,
        lastOpenedAtMillis: 100 + index,
      })),
    ]);

    expect(normalized).toHaveLength(ELECTRON_RECENT_NOTES_LIMIT);
    expect(normalized[0]).toMatchObject({ noteId: `extra-${ELECTRON_RECENT_NOTES_LIMIT + 1}` });
    expect(normalized.some((entry) => entry.noteId === '')).toBe(false);
  });

  it('stores notes in MRU order and matches personal/team scopes separately', () => {
    const first = upsertRecentNote([], note({ id: 'note-1', title: 'Personal', teamPath: null }), 1000);
    const second = upsertRecentNote(first, note({ id: 'note-1', title: 'Team', teamPath: 'team' }), 2000);
    const third = upsertRecentNote(second, note({ id: 'note-2', title: '', shortId: '', teamPath: null }), 3000);

    expect(third.map((entry) => [entry.noteId, entry.teamPath, entry.title, entry.shortId])).toEqual([
      ['note-2', null, 'Untitled', 'note-2'],
      ['note-1', 'team', 'Team', 'note-1'],
      ['note-1', null, 'Personal', 'note-1'],
    ]);
    expect(recentNoteMatches(note({ id: 'note-1', teamPath: 'team' }), third[1])).toBe(true);
    expect(recentNoteMatches(note({ id: 'note-1', teamPath: null }), third[1])).toBe(false);
  });

  it('reads, writes, and removes recent notes from storage', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size;
      },
    } as Storage;

    const notes = upsertRecentNote([], note({ id: 'note-1', title: 'Saved' }), 1000);
    writeRecentNotes(storageLike, notes);

    expect(storage.has(ELECTRON_RECENT_NOTES_STORAGE_KEY)).toBe(true);
    expect(readRecentNotes(storageLike)).toEqual(notes);
    expect(removeRecentNote(notes, 'note-1', null)).toEqual([]);
  });
});
