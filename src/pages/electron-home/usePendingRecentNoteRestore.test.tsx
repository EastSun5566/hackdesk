import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import type { NoteSummary } from '@/lib/electron-api';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import { usePendingRecentNoteRestore } from './usePendingRecentNoteRestore';

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}));

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    content: input.content ?? null,
    createdAtMillis: null,
    description: '',
    folderPaths: [],
    id: input.id,
    lastChangeUser: null,
    permalink: null,
    publishLink: `https://hackmd.io/${input.id}`,
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: input.shortId ?? input.id,
    tags: [],
    tagsUpdatedAtMillis: null,
    teamPath: input.teamPath ?? null,
    title: input.title,
    titleUpdatedAtMillis: null,
    updatedAtMillis: input.updatedAtMillis ?? null,
    userPath: null,
    writePermission: 'owner',
    ...input,
  };
}

function recent(overrides: Partial<ElectronRecentNote> = {}): ElectronRecentNote {
  return {
    lastOpenedAtMillis: 1,
    noteId: 'note-1',
    shortId: 'note-1',
    teamPath: null,
    title: 'Recent note',
    ...overrides,
  };
}

describe('usePendingRecentNoteRestore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reveals a pending recent note once its target scope is loaded', async () => {
    const loadedTree = buildHackmdFolderTree([note({ id: 'note-1', title: 'Loaded note' })]);
    const revealNoteEntry = vi.fn(async () => true);

    const { result } = renderHook(() => usePendingRecentNoteRestore({
      isNotesFetching: false,
      isNotesLoading: false,
      removeRecentNoteEntry: vi.fn(),
      revealNoteEntry,
      scope: { type: 'personal', label: 'My Workspace' },
      tree: loadedTree,
    }));

    act(() => {
      result.current.queuePendingRecentNote(recent());
    });

    await waitFor(() => {
      expect(revealNoteEntry).toHaveBeenCalledWith(loadedTree.allNotes[0]);
    });
    expect(result.current.getPendingRecentNote()).toBeNull();
  });

  it('removes a missing pending recent note from the current scope', async () => {
    const removeRecentNoteEntry = vi.fn();

    const { result } = renderHook(() => usePendingRecentNoteRestore({
      isNotesFetching: false,
      isNotesLoading: false,
      removeRecentNoteEntry,
      revealNoteEntry: vi.fn(async () => true),
      scope: { type: 'personal', label: 'My Workspace' },
      tree: buildHackmdFolderTree([]),
    }));

    act(() => {
      result.current.queuePendingRecentNote(recent({ noteId: 'missing', title: 'Missing note' }));
    });

    await waitFor(() => {
      expect(removeRecentNoteEntry).toHaveBeenCalledWith('missing', null);
    });
    expect(toast.info).toHaveBeenCalledWith('“Missing note” is no longer available in this workspace.');
    expect(result.current.getPendingRecentNote()).toBeNull();
  });

  it('waits until the pending note target team scope is active and loaded', () => {
    const revealNoteEntry = vi.fn(async () => true);

    const { result } = renderHook(() => usePendingRecentNoteRestore({
      isNotesFetching: false,
      isNotesLoading: false,
      removeRecentNoteEntry: vi.fn(),
      revealNoteEntry,
      scope: { type: 'personal', label: 'My Workspace' },
      tree: buildHackmdFolderTree([note({ id: 'team-note', title: 'Team note', teamPath: 'team-one' })]),
    }));

    act(() => {
      result.current.queuePendingRecentNote(recent({ noteId: 'team-note', teamPath: 'team-one' }));
    });

    expect(revealNoteEntry).not.toHaveBeenCalled();
    expect(result.current.getPendingRecentNote()?.noteId).toBe('team-note');
  });
});
