import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/ui/toast';

import type { NoteSummary, TeamSummary } from '@/lib/electron-api';
import type { QuickOpenFolderResult, QuickOpenWorkspaceResult } from '@/lib/electron-quick-open';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import { useElectronHomeCommandPalette, type ElectronHomeCommandPaletteOptions } from './useElectronHomeCommandPalette';

vi.mock('@/components/ui/toast', () => ({
  toast: {
    info: vi.fn(),
  },
}));

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

function team(overrides: Partial<TeamSummary> = {}): TeamSummary {
  return {
    createdAtMillis: null,
    description: null,
    id: 'team-1',
    logo: null,
    name: 'Team One',
    ownerId: null,
    path: 'team-one',
    upgraded: false,
    visibility: 'private',
    ...overrides,
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

function createOptions(overrides: Partial<ElectronHomeCommandPaletteOptions> = {}): ElectronHomeCommandPaletteOptions {
  const tree = buildHackmdFolderTree([
    note({ id: 'note-1', title: 'Loaded note' }),
  ]);

  return {
    displayScope: { type: 'personal', label: 'My Workspace' },
    expandNavigator: vi.fn(),
    focusNavigator: vi.fn(),
    handleShowFinderResults: vi.fn(),
    isNotesFetching: false,
    isNotesLoading: false,
    palette: { mode: 'commands', open: false, search: '' },
    recentNotes: [recent()],
    removeRecentNoteEntry: vi.fn(),
    revealFolderIds: vi.fn(),
    revealNoteEntry: vi.fn(async () => true),
    scope: { type: 'personal', label: 'My Workspace' },
    selectedFolderId: null,
    selectedNoteId: null,
    setPalette: vi.fn(),
    setSelectedFolderId: vi.fn(),
    setWorkspaceScope: vi.fn(),
    teams: [team()],
    tree,
    ...overrides,
  };
}

describe('useElectronHomeCommandPalette', () => {
  it('opens the command palette with an empty search', () => {
    const options = createOptions();
    const { result } = renderHook(() => useElectronHomeCommandPalette(options));

    act(() => {
      result.current.openPalette();
    });

    expect(options.setPalette).toHaveBeenCalledWith({ mode: 'commands', open: true, search: '' });
  });

  it('opens Quick Open with an empty search', () => {
    const options = createOptions();
    const { result } = renderHook(() => useElectronHomeCommandPalette(options));

    act(() => {
      result.current.openQuickOpen();
    });

    expect(options.setPalette).toHaveBeenCalledWith({ mode: 'quick-open', open: true, search: '' });
  });

  it('reveals a loaded recent note through command palette props', () => {
    const options = createOptions();
    const { result } = renderHook(() => useElectronHomeCommandPalette(options));

    act(() => {
      result.current.commandPaletteProps.onSelectRecentNote(recent());
    });

    expect(options.revealNoteEntry).toHaveBeenCalledWith(options.tree.allNotes[0]);
    expect(options.removeRecentNoteEntry).not.toHaveBeenCalled();
  });

  it('switches workspaces and reveals folders through command palette props', () => {
    const options = createOptions();
    const workspace: QuickOpenWorkspaceResult = {
      description: 'History',
      id: 'history',
      label: 'History',
      type: 'history',
    };
    const folder: QuickOpenFolderResult = {
      ancestorIds: ['parent'],
      id: 'folder-a',
      label: 'Parent / Folder A',
      name: 'Folder A',
      noteCount: 2,
    };
    const { result } = renderHook(() => useElectronHomeCommandPalette(options));

    act(() => {
      result.current.commandPaletteProps.onSelectWorkspace(workspace);
      result.current.commandPaletteProps.onSelectFolder(folder);
    });

    expect(options.setWorkspaceScope).toHaveBeenCalledWith({ type: 'history', label: 'History' });
    expect(options.expandNavigator).toHaveBeenCalledOnce();
    expect(options.revealFolderIds).toHaveBeenCalledWith(['parent', 'folder-a']);
    expect(options.setSelectedFolderId).toHaveBeenCalledWith('folder-a');
    expect(options.focusNavigator).toHaveBeenCalledTimes(2);
  });

  it('queues a team recent note before switching scope', () => {
    const options = createOptions();
    const { result } = renderHook(() => useElectronHomeCommandPalette(options));

    act(() => {
      result.current.commandPaletteProps.onSelectRecentNote(recent({
        noteId: 'team-note',
        teamPath: 'team-one',
        title: 'Team note',
      }));
    });

    expect(options.setWorkspaceScope).toHaveBeenCalledWith({
      label: 'Team One',
      teamPath: 'team-one',
      type: 'team',
    });
    expect(toast.info).toHaveBeenCalledWith('Loading Team One before opening “Team note”.');
    expect(options.focusNavigator).toHaveBeenCalledOnce();
  });
});
