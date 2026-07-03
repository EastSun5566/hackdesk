import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ElectronActionContext } from '@/lib/electron-actions';
import type { FolderSummary, NoteSummary, TeamSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import { CommandPaletteDialog } from './CommandPaletteDialog';

const context: ElectronActionContext = {
  activePaneTabCount: 1,
  activePaneTabsToRightCount: 0,
  canCreate: true,
  canModifySelectedFolder: true,
  editorMode: 'standard',
  hasToken: true,
  inspectorCollapsed: true,
  isSavingNote: false,
  navigationBackCount: 0,
  navigationForwardCount: 0,
  navigatorCollapsed: false,
  noteDirty: false,
  openTabCount: 1,
  paneCount: 1,
  recentlyClosedTabCount: 0,
  scopeType: 'personal',
  selectedFolderId: 'folder-alpha',
  selectedNoteId: 'exact',
  workspaceRailCollapsed: false,
};

const folder: FolderSummary = {
  clientId: null,
  color: null,
  createdAtMillis: 1,
  description: null,
  icon: null,
  id: 'folder-alpha',
  name: 'Alpha Folder',
  parentId: null,
  updatedAtMillis: 1,
};

const team: TeamSummary = {
  createdAtMillis: 1,
  description: null,
  id: 'team-alpha',
  logo: null,
  name: 'Alpha Team',
  ownerId: null,
  path: 'alpha-team',
  upgraded: false,
  visibility: 'private',
};

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    content: null,
    createdAtMillis: null,
    description: input.description ?? '',
    folderPaths: input.folderPaths ?? [],
    id: input.id,
    lastChangeUser: null,
    permalink: null,
    publishLink: '',
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

const notes = [
  note({ id: 'metadata', title: 'Other', tags: ['alpha'], updatedAtMillis: 100 }),
  note({ id: 'contains-recent', title: 'Planning Alpha Ideas', updatedAtMillis: 10 }),
  note({ id: 'contains-newer', title: 'Team Alpha Notes', updatedAtMillis: 30 }),
  note({ id: 'prefix', title: 'Alpha Plan', updatedAtMillis: 20 }),
  note({ id: 'exact', title: 'Alpha', shortId: 'exact-short', folderPaths: [folder], updatedAtMillis: 1 }),
];

type CommandPaletteDialogProps = ComponentProps<typeof CommandPaletteDialog>;

function renderPalette(overrides: Partial<CommandPaletteDialogProps> = {}) {
  const props: CommandPaletteDialogProps = {
    context,
    folderTree: buildHackmdFolderTree(notes, [folder]),
    onRunAction: vi.fn(),
    onSelectFolder: vi.fn(),
    onSelectNote: vi.fn(),
    onSelectRecentNote: vi.fn(),
    onSelectWorkspace: vi.fn(),
    onShowFinderResults: vi.fn(),
    onStateChange: vi.fn(),
    recentNotes: [
      {
        lastOpenedAtMillis: 500,
        noteId: 'exact',
        shortId: 'exact-short',
        teamPath: null,
        title: 'Alpha',
      },
      {
        lastOpenedAtMillis: 400,
        noteId: 'contains-recent',
        shortId: 'contains-recent',
        teamPath: null,
        title: 'Planning Alpha Ideas',
      },
    ],
    scope: { label: 'My Workspace', type: 'personal' },
    selectedFolderId: 'folder-alpha',
    selectedNoteId: 'exact',
    state: { open: true, search: '' },
    teams: [team],
    ...overrides,
  };

  render(<CommandPaletteDialog {...props} />);
  return props;
}

describe('CommandPaletteDialog', () => {
  it('shows a contextual home without duplicating recent notes', () => {
    renderPalette();

    const input = screen.getByRole('combobox', { name: 'Search notes, folders, and commands' });
    expect(input).toHaveAttribute('placeholder', 'Search notes, folders, and commands…');
    expect(screen.getByRole('dialog', { name: 'Command Palette' })).toHaveAccessibleDescription(
      'Search notes, folders, workspaces, and commands.',
    );
    expect(screen.getByText('Recent Notes')).toBeVisible();
    expect(screen.getByText('Workspaces')).toBeVisible();
    expect(screen.getByText('Quick Actions')).toBeVisible();
    expect(Array.from(document.querySelectorAll('[cmdk-group-heading]')).map((heading) => heading.textContent)).toEqual([
      'Recent Notes',
      'Workspaces',
      'Quick Actions',
    ]);
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Folders')).not.toBeInTheDocument();
    expect(screen.getAllByText('Alpha')).toHaveLength(1);
    expect(screen.getByText('Current note')).toBeInTheDocument();
    expect(screen.getByText('Current workspace')).toBeInTheDocument();
    expect(screen.queryByText('exact-short')).not.toBeInTheDocument();
    expect(screen.getByText('⌘N')).toBeVisible();
  });

  it('keeps item titles readable and aligns the close control in the input row', () => {
    renderPalette();

    const title = screen.getByText('Alpha');
    expect(title).toHaveClass('text-[color:var(--command-item-title)]');
    expect(title).toHaveClass('font-medium');
    expect(screen.getAllByText('My Workspace').some((node) => node.classList.contains('text-[color:var(--command-item-meta)]'))).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Search notes, folders, and commands' }))
      .toHaveClass('placeholder:text-[color:var(--command-placeholder)]');

    const closeButton = screen.getByRole('button', { name: 'Close command palette' });
    expect(closeButton).toHaveClass('size-8');
    expect(closeButton).toHaveClass('items-center');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('preserves helper ranking and group order for searched results', () => {
    renderPalette({ state: { open: true, search: 'alpha' } });

    expect(screen.queryByText('Recent Notes')).not.toBeInTheDocument();
    const headings = Array.from(document.querySelectorAll('[cmdk-group-heading]'))
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Notes', 'Folders', 'Workspaces', 'Finder']);

    const noteGroup = screen.getByText('Notes').closest('[cmdk-group]');
    expect(noteGroup).not.toBeNull();
    const noteOptions = within(noteGroup as HTMLElement).getAllByRole('option');
    expect(noteOptions).toHaveLength(5);
    expect(noteOptions[0]).toHaveTextContent('Alpha');
    expect(noteOptions[1]).toHaveTextContent('Alpha Plan');
    expect(noteOptions[2]).toHaveTextContent('Planning Alpha Ideas');
    expect(noteOptions[3]).toHaveTextContent('Team Alpha Notes');
    expect(noteOptions[4]).toHaveTextContent('Other');
    expect(screen.getByText('Current folder')).toBeInTheDocument();
    expect(screen.queryByText('exact-short')).not.toBeInTheDocument();
  });

  it('keeps hidden short IDs searchable', () => {
    renderPalette({ state: { open: true, search: 'exact-short' } });

    expect(screen.getByText('Alpha')).toBeVisible();
    expect(screen.queryByText('exact-short')).not.toBeInTheDocument();
  });

  it('keeps keyboard selection, action shortcuts, and close reset behavior', async () => {
    const onRunAction = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({
      onRunAction,
      onStateChange,
      state: { open: true, search: 'new note' },
    });

    const input = screen.getByRole('combobox', { name: 'Search notes, folders, and commands' });
    const action = screen.getByRole('option', { name: /New Note/ });
    expect(action).toHaveAttribute('aria-selected', 'true');
    expect(within(action).getByText('⌘N')).toBeVisible();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRunAction).toHaveBeenCalledWith('new-note');
    expect(onStateChange).toHaveBeenCalledWith({ open: false, search: '' });

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith({ open: false, search: '' }));
  });
});
