import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_NOTE_FINDER_STATE, type NoteFinderState } from '@/lib/electron-note-finder';
import type { NoteSummary, FolderPathSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import type { NoteDropOperation } from '@/lib/hackmd-note-dnd';

import { useWorkbenchNavigator, type WorkbenchNavigatorOptions } from './useWorkbenchNavigator';

function folder(id: string, name: string, parentId: string | null = null): FolderPathSummary {
  return {
    clientId: null,
    color: null,
    icon: null,
    id,
    name,
    parentId,
  };
}

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

function createOptions(overrides: Partial<WorkbenchNavigatorOptions> = {}): WorkbenchNavigatorOptions {
  const folderA = folder('folder-a', 'Folder A');
  const tree = buildHackmdFolderTree([
    note({ id: 'alpha', title: 'Alpha note', folderPaths: [folderA] }),
    note({ id: 'beta', title: 'Beta note' }),
  ], [folderA]);

  return {
    canUseHackmd: true,
    deferredFinderState: DEFAULT_NOTE_FINDER_STATE,
    expandNavigator: vi.fn(),
    finderActive: false,
    focusNavigator: vi.fn(),
    moveNote: vi.fn(),
    requestSelectNote: vi.fn(async () => true),
    scopeType: 'personal',
    selectedFolderId: null,
    setCollapsedFolderIds: vi.fn(),
    setFinderState: vi.fn(),
    setSelectedFolderId: vi.fn(),
    tree,
    ...overrides,
  };
}

describe('useWorkbenchNavigator', () => {
  it('uses finder results when finder is active and selected folder entries otherwise', () => {
    const folderA = folder('folder-a', 'Folder A');
    const tree = buildHackmdFolderTree([
      note({ id: 'alpha', title: 'Alpha note', folderPaths: [folderA] }),
      note({ id: 'beta', title: 'Beta note' }),
    ], [folderA]);
    const { result, rerender } = renderHook((props: WorkbenchNavigatorOptions) => useWorkbenchNavigator(props), {
      initialProps: createOptions({
        selectedFolderId: 'folder-a',
        tree,
      }),
    });

    expect(result.current.visibleEntries.map((entry) => entry.note.id)).toEqual(['alpha']);

    rerender(createOptions({
      deferredFinderState: { ...DEFAULT_NOTE_FINDER_STATE, query: 'beta' },
      finderActive: true,
      selectedFolderId: 'folder-a',
      tree,
    }));

    expect(result.current.visibleEntries.map((entry) => entry.note.id)).toEqual(['beta']);
  });

  it('selects and expands a selected folder', () => {
    const setCollapsedFolderIds = vi.fn((updater: (current: Set<string>) => Set<string>) => updater(new Set(['folder-a'])));
    const setSelectedFolderId = vi.fn();
    const { result } = renderHook(() => useWorkbenchNavigator(createOptions({
      setCollapsedFolderIds,
      setSelectedFolderId,
    })));

    result.current.handleFolderSelect('folder-a');

    expect(setSelectedFolderId).toHaveBeenCalledWith('folder-a');
    expect(setCollapsedFolderIds).toHaveBeenCalledOnce();
    expect(setCollapsedFolderIds.mock.results[0]?.value.has('folder-a')).toBe(false);
  });

  it('shows finder results by expanding navigator, setting workspace query, and focusing navigator', () => {
    const expandNavigator = vi.fn();
    const focusNavigator = vi.fn();
    const setFinderState = vi.fn((updater: (current: NoteFinderState) => NoteFinderState) => updater(DEFAULT_NOTE_FINDER_STATE));
    const { result } = renderHook(() => useWorkbenchNavigator(createOptions({
      expandNavigator,
      focusNavigator,
      setFinderState,
    })));

    result.current.handleShowFinderResults('release');

    expect(expandNavigator).toHaveBeenCalledOnce();
    expect(focusNavigator).toHaveBeenCalledOnce();
    expect(setFinderState.mock.results[0]?.value).toMatchObject({
      query: 'release',
      searchScope: 'workspace',
    });
  });

  it('selects target folder without moving when the note drop is unchanged', () => {
    const requestSelectNote = vi.fn(async () => true);
    const setSelectedFolderId = vi.fn();
    const moveNote = vi.fn();
    const options = createOptions({ moveNote, requestSelectNote, setSelectedFolderId });
    const operation: NoteDropOperation = {
      changed: false,
      note: options.tree.allNotes[0],
      targetFolderId: null,
    };
    const { result } = renderHook(() => useWorkbenchNavigator(options));

    result.current.handleNoteMove(operation);

    expect(setSelectedFolderId).toHaveBeenCalledWith(UNFILED_FOLDER_ID);
    expect(requestSelectNote).toHaveBeenCalledWith(operation.note.note, { trackRecent: false });
    expect(moveNote).not.toHaveBeenCalled();
  });

  it('moves a changed note drop through the move callback', () => {
    const moveNote = vi.fn();
    const options = createOptions({ moveNote });
    const operation: NoteDropOperation = {
      changed: true,
      note: options.tree.allNotes[0],
      targetFolderId: 'folder-a',
    };
    const { result } = renderHook(() => useWorkbenchNavigator(options));

    result.current.handleNoteMove(operation);

    expect(moveNote).toHaveBeenCalledWith({
      note: operation.note,
      targetFolderId: 'folder-a',
    });
  });
});
