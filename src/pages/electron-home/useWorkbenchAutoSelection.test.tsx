import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NoteSummary } from '@/lib/electron-api';
import type { FolderTreeNote } from '@/lib/hackmd-folders';

import { useWorkbenchAutoSelection } from './useWorkbenchAutoSelection';

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    content: input.content ?? null,
    createdAtMillis: null,
    description: '',
    folderPaths: input.folderPaths ?? [],
    id: input.id,
    lastChangeUser: null,
    permalink: null,
    publishLink: `https://hackmd.io/${input.id}`,
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: input.shortId ?? input.id,
    tags: input.tags ?? [],
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

function entry(summary: NoteSummary): FolderTreeNote {
  return {
    folderLabel: '',
    folderPath: [],
    note: summary,
  };
}

describe('useWorkbenchAutoSelection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the first visible note when the workspace has no selected note', async () => {
    const firstNote = note({ id: 'note-1', title: 'First' });
    const requestSelectNote = vi.fn(async () => true);

    renderHook(() => useWorkbenchAutoSelection({
      autoSelectSuppressionRef: { current: null },
      hasActiveDocument: false,
      manualEmptyWorkspaceRef: { current: false },
      requestSelectNote,
      scopeStorageKey: 'personal',
      selectedFolderId: null,
      selectedNote: null,
      visibleEntries: [entry(firstNote)],
    }));

    await waitFor(() => {
      expect(requestSelectNote).toHaveBeenCalledWith(firstNote, { trackRecent: false });
    });
  });

  it('does not auto-select when manual empty state is active', () => {
    const requestSelectNote = vi.fn(async () => true);

    renderHook(() => useWorkbenchAutoSelection({
      autoSelectSuppressionRef: { current: null },
      hasActiveDocument: false,
      manualEmptyWorkspaceRef: { current: true },
      requestSelectNote,
      scopeStorageKey: 'personal',
      selectedFolderId: null,
      selectedNote: null,
      visibleEntries: [entry(note({ id: 'note-1', title: 'First' }))],
    }));

    expect(requestSelectNote).not.toHaveBeenCalled();
  });

  it('does not auto-select the first note while an unsaved draft is the active document', () => {
    const requestSelectNote = vi.fn(async () => true);

    renderHook(() => useWorkbenchAutoSelection({
      autoSelectSuppressionRef: { current: null },
      hasActiveDocument: true,
      manualEmptyWorkspaceRef: { current: false },
      requestSelectNote,
      scopeStorageKey: 'personal',
      selectedFolderId: null,
      selectedNote: null,
      visibleEntries: [entry(note({ id: 'note-1', title: 'First' }))],
    }));

    expect(requestSelectNote).not.toHaveBeenCalled();
  });

  it('suppresses repeated failed auto-select attempts for the same note', async () => {
    const firstNote = note({ id: 'note-1', title: 'First' });
    const autoSelectSuppressionRef = { current: null };
    const requestSelectNote = vi.fn(async () => false);
    const { rerender } = renderHook(() => useWorkbenchAutoSelection({
      autoSelectSuppressionRef,
      hasActiveDocument: false,
      manualEmptyWorkspaceRef: { current: false },
      requestSelectNote,
      scopeStorageKey: 'personal',
      selectedFolderId: null,
      selectedNote: null,
      visibleEntries: [entry(firstNote)],
    }));

    await waitFor(() => {
      expect(autoSelectSuppressionRef.current).toBe('personal:workspace:none:note-1');
    });

    rerender();

    expect(requestSelectNote).toHaveBeenCalledTimes(1);
  });
});
