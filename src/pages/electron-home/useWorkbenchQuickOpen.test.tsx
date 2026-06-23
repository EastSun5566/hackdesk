import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import type { NoteSummary, TeamSummary } from '@/lib/electron-api';
import type { QuickOpenFolderResult, QuickOpenWorkspaceResult } from '@/lib/electron-quick-open';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import { useWorkbenchQuickOpen, type WorkbenchQuickOpenOptions } from './useWorkbenchQuickOpen';

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

function createOptions(overrides: Partial<WorkbenchQuickOpenOptions> = {}): WorkbenchQuickOpenOptions {
  const tree = buildHackmdFolderTree([
    note({ id: 'note-1', title: 'Loaded note' }),
  ]);

  return {
    expandNavigator: vi.fn(),
    focusNavigator: vi.fn(),
    isNotesFetching: false,
    isNotesLoading: false,
    pendingRecentNoteRef: { current: null },
    removeRecentNoteEntry: vi.fn(),
    revealFolderIds: vi.fn(),
    revealNoteEntry: vi.fn(async () => true),
    scope: { type: 'personal', label: 'My Workspace' },
    setSelectedFolderId: vi.fn(),
    setWorkspaceScope: vi.fn(),
    teams: [team()],
    tree,
    ...overrides,
  };
}

describe('useWorkbenchQuickOpen', () => {
  it('reveals a recent note that is already loaded', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchQuickOpen(options));

    result.current.handleQuickOpenRecentNote(recent());

    expect(options.pendingRecentNoteRef.current).toBeNull();
    expect(options.revealNoteEntry).toHaveBeenCalledWith(options.tree.allNotes[0]);
    expect(options.removeRecentNoteEntry).not.toHaveBeenCalled();
  });

  it('removes a missing recent note from the loaded current scope', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchQuickOpen(options));

    result.current.handleQuickOpenRecentNote(recent({ noteId: 'missing', title: 'Missing note' }));

    expect(options.removeRecentNoteEntry).toHaveBeenCalledWith('missing', null);
    expect(toast.info).toHaveBeenCalledWith('“Missing note” is no longer available in this workspace.');
    expect(options.setWorkspaceScope).not.toHaveBeenCalled();
  });

  it('switches to a team scope before opening a team recent note', () => {
    const options = createOptions();
    const entry = recent({ noteId: 'team-note', teamPath: 'team-one', title: 'Team note' });
    const { result } = renderHook(() => useWorkbenchQuickOpen(options));

    result.current.handleQuickOpenRecentNote(entry);

    expect(options.pendingRecentNoteRef.current).toBe(entry);
    expect(options.setWorkspaceScope).toHaveBeenCalledWith({
      label: 'Team One',
      teamPath: 'team-one',
      type: 'team',
    });
    expect(options.focusNavigator).toHaveBeenCalledOnce();
  });

  it('opens workspace and folder quick-open results through navigator focus', () => {
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
    const { result } = renderHook(() => useWorkbenchQuickOpen(options));

    result.current.handleQuickOpenWorkspace(workspace);
    result.current.handleQuickOpenFolder(folder);

    expect(options.pendingRecentNoteRef.current).toBeNull();
    expect(options.setWorkspaceScope).toHaveBeenCalledWith({ type: 'history', label: 'History' });
    expect(options.expandNavigator).toHaveBeenCalledOnce();
    expect(options.revealFolderIds).toHaveBeenCalledWith(['parent', 'folder-a']);
    expect(options.setSelectedFolderId).toHaveBeenCalledWith('folder-a');
    expect(options.focusNavigator).toHaveBeenCalledTimes(2);
  });

  it('reveals note quick-open results directly', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchQuickOpen(options));

    result.current.handleQuickOpenNote(options.tree.allNotes[0]);

    expect(options.revealNoteEntry).toHaveBeenCalledWith(options.tree.allNotes[0]);
  });
});
