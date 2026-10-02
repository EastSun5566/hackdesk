import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { NoteSummary } from '@/lib/electron-api';
import { ELECTRON_RECENT_NOTES_STORAGE_KEY, readRecentNotes } from '@/lib/electron-recent-notes';

import { useElectronHomeRecentNotes } from './useElectronHomeRecentNotes';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

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

  it('refreshes only existing current-vault metadata without changing timestamps, order or other records', () => {
    const records = [
      { vaultId: 'A', noteId: 'note', teamPath: LOCAL_VAULT_TEAM_PATH, title: 'Original', shortId: 'Original.md', lastOpenedAtMillis: 30 },
      { vaultId: 'B', noteId: 'note', teamPath: LOCAL_VAULT_TEAM_PATH, title: 'B', shortId: 'B.md', lastOpenedAtMillis: 20 },
      { noteId: 'remote', teamPath: null, title: 'Remote', shortId: 'remote', lastOpenedAtMillis: 10 },
    ];
    localStorage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify(records));
    const { result } = renderHook(() => useElectronHomeRecentNotes(localStorage, 'A'));
    const moved = { ...note({ id: 'note', title: 'Moved', shortId: 'Folder/Moved.md', teamPath: LOCAL_VAULT_TEAM_PATH }), localVaultId: 'A' };
    act(() => result.current.syncLocalRecentNotes([moved, { ...moved, id: 'new' }]));
    expect(readRecentNotes(localStorage)).toEqual([
      { ...records[0], title: 'Moved', shortId: 'Folder/Moved.md' }, records[1], records[2],
    ]);
    act(() => result.current.syncLocalRecentNotes([{ ...moved, title: 'Wrong vault', localVaultId: 'B' }]));
    expect(result.current.recentNotes[0].title).toBe('Moved');
  });

  it('keeps matching IDs from different vaults separate, hides unknown entries and preserves other vault records', () => {
    localStorage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify([{ noteId: 'unknown', teamPath: LOCAL_VAULT_TEAM_PATH, title: 'Unknown', shortId: 'unknown', lastOpenedAtMillis: 0 }]));
    const { result, rerender } = renderHook((vaultId: string | null) => useElectronHomeRecentNotes(localStorage, vaultId), { initialProps: 'A' as string | null });
    act(() => { result.current.trackRecentNote(note({ id: 'same-id', teamPath: LOCAL_VAULT_TEAM_PATH, title: 'A note' })); });
    rerender('B');
    expect(result.current.recentNotes).toEqual([]);
    act(() => { result.current.trackRecentNote(note({ id: 'same-id', teamPath: LOCAL_VAULT_TEAM_PATH, title: 'B note' })); });
    expect(result.current.recentNotes).toEqual([expect.objectContaining({ vaultId: 'B', title: 'B note' })]);
    act(() => { result.current.removeRecentNoteEntry('same-id', LOCAL_VAULT_TEAM_PATH); });
    expect(readRecentNotes(localStorage)).toEqual(expect.arrayContaining([expect.objectContaining({ vaultId: 'A' }), expect.objectContaining({ noteId: 'unknown' })]));
    act(() => {
      for (let i = 0; i < 14; i++) result.current.trackRecentNote(note({ id: `B-${i}`, teamPath: LOCAL_VAULT_TEAM_PATH, title: `B ${i}` }));
    });
    rerender('A');
    expect(result.current.recentNotes).toEqual([expect.objectContaining({ vaultId: 'A', title: 'A note' })]);
    rerender(null);
    expect(result.current.recentNotes).toEqual([]);
  });
});
