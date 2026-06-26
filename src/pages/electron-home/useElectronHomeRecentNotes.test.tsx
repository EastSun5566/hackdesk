import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { NoteSummary } from '@/lib/electron-api';
import { readRecentNotes } from '@/lib/electron-recent-notes';

import { useElectronHomeRecentNotes } from './useElectronHomeRecentNotes';

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    content: input.content ?? null,
    createdAtMillis: input.createdAtMillis ?? null,
    description: input.description ?? '',
    folderPaths: input.folderPaths ?? [],
    id: input.id,
    lastChangeUser: input.lastChangeUser ?? null,
    permalink: input.permalink ?? null,
    publishLink: input.publishLink ?? `https://hackmd.io/${input.id}`,
    publishedAtMillis: input.publishedAtMillis ?? null,
    publishType: input.publishType ?? 'edit',
    readPermission: input.readPermission ?? 'owner',
    shortId: input.shortId ?? input.id,
    tags: input.tags ?? [],
    tagsUpdatedAtMillis: input.tagsUpdatedAtMillis ?? null,
    teamPath: input.teamPath ?? null,
    title: input.title,
    titleUpdatedAtMillis: input.titleUpdatedAtMillis ?? null,
    updatedAtMillis: input.updatedAtMillis ?? null,
    userPath: input.userPath ?? null,
    writePermission: input.writePermission ?? 'owner',
  };
}

describe('useElectronHomeRecentNotes', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('tracks and persists recent notes', () => {
    const { result } = renderHook(() => useElectronHomeRecentNotes());

    act(() => {
      result.current.trackRecentNote(note({ id: 'note-a', title: 'Alpha', shortId: 'a' }));
    });

    expect(result.current.recentNotes).toMatchObject([
      { noteId: 'note-a', shortId: 'a', title: 'Alpha' },
    ]);
    expect(readRecentNotes(window.localStorage)).toMatchObject([
      { noteId: 'note-a', shortId: 'a', title: 'Alpha' },
    ]);
  });

  it('upserts an existing recent note and removes it by identity', () => {
    const { result } = renderHook(() => useElectronHomeRecentNotes());

    act(() => {
      result.current.trackRecentNote(note({ id: 'note-a', title: 'Alpha', teamPath: 'team-a' }));
      result.current.trackRecentNote(note({ id: 'note-a', title: 'Renamed Alpha', teamPath: 'team-a' }));
    });

    expect(result.current.recentNotes).toHaveLength(1);
    expect(result.current.recentNotes[0]).toMatchObject({
      noteId: 'note-a',
      teamPath: 'team-a',
      title: 'Renamed Alpha',
    });

    act(() => {
      result.current.removeRecentNoteEntry('note-a', 'team-a');
    });

    expect(result.current.recentNotes).toEqual([]);
    expect(readRecentNotes(window.localStorage)).toEqual([]);
  });
});
