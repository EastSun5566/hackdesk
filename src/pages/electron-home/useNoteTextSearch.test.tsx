import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NoteSearchInput } from '@/lib/note-index';

import { getNoteSearchScope, useNoteTextSearch } from './useNoteTextSearch';
import type { WorkspaceScope } from './types';

function installApi() {
  const search = vi.fn(async ({ query }: NoteSearchInput) => ({
    matches: [{ noteId: `note-for-${query}`, title: 'Note', snippet: `…${query}…` }],
    indexedCount: 3,
  }));
  window.hackdeskAPI = { getRuntimeEnvironment: () => 'electron', noteIndex: { search, status: vi.fn(), clear: vi.fn() } } as unknown as typeof window.hackdeskAPI;
  return search;
}

afterEach(() => {
  vi.useRealTimers();
  delete window.hackdeskAPI;
});

describe('useNoteTextSearch', () => {
  it('maps workspaces to what the index covers', () => {
    expect(getNoteSearchScope({ type: 'local', label: 'Vault', vaultId: 'v1' })).toEqual({ type: 'local', vaultId: 'v1' });
    expect(getNoteSearchScope({ type: 'local', label: 'Vault' })).toBeNull();
    expect(getNoteSearchScope({ type: 'personal', label: 'Me' })).toEqual({ type: 'hackmd', teamPath: null });
    expect(getNoteSearchScope({ type: 'team', label: 'Team', teamPath: 'team-a' })).toEqual({ type: 'hackmd', teamPath: 'team-a' });
    expect(getNoteSearchScope({ type: 'history', label: 'History' })).toBeNull();
  });

  it('searches once typing pauses, and never shows results for an older query', async () => {
    vi.useFakeTimers();
    const search = installApi();
    const scope: WorkspaceScope = { type: 'personal', label: 'Me' };
    const { result, rerender } = renderHook(({ query }) => useNoteTextSearch(scope, query, null), { initialProps: { query: 'off' } });
    rerender({ query: 'offline' });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith({ query: 'offline', scope: { type: 'hackmd', teamPath: null } });
    expect(result.current).toMatchObject({ indexedCount: 3, source: 'hackmd' });
    expect([...result.current.matches.keys()]).toEqual(['note-for-offline']);

    rerender({ query: 'offline plan' });
    expect(result.current.matches.size).toBe(0);
    rerender({ query: '' });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(search).toHaveBeenCalledTimes(1);
  });
});
