import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ElectronActionContext } from '@/lib/electron-actions';
import type { FolderSummary, NoteSummary, TeamSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';
import { HACKDESK_THEME_PRESETS } from '@/lib/themes';

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
    onConnectHackmd: vi.fn(),
    onCopyCurrentNoteLink: vi.fn(),
    onCopyCurrentNoteMarkdownLink: vi.fn(),
    onOpenLocalFolder: vi.fn(),
    onRequestDisconnectHackmd: vi.fn(),
    onShareCurrentNote: vi.fn(),
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
    currentNoteIsRemote: true,
    hasCurrentNote: true,
    hasHackmdApiToken: true,
    hasLocalVault: true,
    platform: 'darwin',
    state: { mode: 'commands', open: true, search: '' },
    teams: [team],
    themeMode: 'system',
    themePresetId: 'hackmd-neo',
    themePresets: HACKDESK_THEME_PRESETS,
    onSelectThemeMode: vi.fn(),
    onSelectThemePreset: vi.fn(),
    onSwitchLocalVault: vi.fn(),
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
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Current Note')).not.toBeInTheDocument();
    expect(screen.queryByText('Local')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Folders')).not.toBeInTheDocument();
    expect(screen.getAllByText('Alpha')).toHaveLength(1);
    expect(screen.getByText('Current note')).toBeInTheDocument();
    expect(screen.getByText('Current workspace')).toBeInTheDocument();
    expect(screen.queryByText('exact-short')).not.toBeInTheDocument();
    expect(screen.getByText('⌘N')).toBeVisible();
  });

  it('shows only notes, folders, and workspaces in Quick Open mode', () => {
    renderPalette({ state: { mode: 'quick-open', open: true, search: '' } });

    expect(screen.getByRole('dialog', { name: 'Quick Open' })).toHaveAccessibleDescription(
      'Search notes, folders, and workspaces.',
    );
    expect(screen.getByRole('combobox', { name: 'Search notes, folders, and workspaces' })).toHaveAttribute(
      'placeholder',
      'Search notes, folders, and workspaces…',
    );
    expect(Array.from(document.querySelectorAll('[cmdk-group-heading]')).map((heading) => heading.textContent)).toEqual([
      'Recent Notes',
      'Workspaces',
    ]);
    expect(screen.queryByText('Quick Actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Local')).not.toBeInTheDocument();
  });

  it('keeps Quick Open search limited to note-navigation results', () => {
    renderPalette({ state: { mode: 'quick-open', open: true, search: 'alpha' } });

    expect(Array.from(document.querySelectorAll('[cmdk-group-heading]')).map((heading) => heading.textContent)).toEqual([
      'Notes',
      'Folders',
      'Workspaces',
    ]);
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Finder')).not.toBeInTheDocument();
  });

  it('switches from the command palette to Quick Open without closing the dialog', () => {
    const onRunAction = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({
      onRunAction,
      onStateChange,
      state: { mode: 'commands', open: true, search: 'quick open' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Quick Open/ }));

    expect(onStateChange).toHaveBeenCalledWith({ mode: 'quick-open', open: true, search: '' });
    expect(onRunAction).not.toHaveBeenCalled();
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
    renderPalette({ state: { mode: 'commands', open: true, search: 'alpha' } });

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
    renderPalette({ state: { mode: 'commands', open: true, search: 'exact-short' } });

    expect(screen.getByText('Alpha')).toBeVisible();
    expect(screen.queryByText('exact-short')).not.toBeInTheDocument();
  });

  it('runs theme preset commands from searched appearance results', () => {
    const onSelectThemePreset = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({
      onSelectThemePreset,
      onStateChange,
      state: { mode: 'commands', open: true, search: 'solarized' },
    });

    expect(screen.getByText('Appearance')).toBeVisible();
    const command = screen.getByRole('option', { name: /Use Theme: Solarized/ });

    fireEvent.click(command);

    expect(onSelectThemePreset).toHaveBeenCalledWith('solarized');
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
  });

  it('runs theme mode commands from searched appearance results', () => {
    const onSelectThemeMode = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({
      onSelectThemeMode,
      onStateChange,
      state: { mode: 'commands', open: true, search: 'dark' },
    });

    const command = screen.getByRole('option', { name: /Use Dark Theme/ });

    fireEvent.click(command);

    expect(onSelectThemeMode).toHaveBeenCalledWith('dark');
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
  });

  it('marks active theme commands as current without running callbacks', () => {
    const onSelectThemeMode = vi.fn();
    const onSelectThemePreset = vi.fn();
    renderPalette({
      onSelectThemeMode,
      onSelectThemePreset,
      state: { mode: 'commands', open: true, search: 'solarized' },
      themeMode: 'dark',
      themePresetId: 'solarized',
    });

    expect(screen.getByText('Current theme')).toBeInTheDocument();
    expect(screen.getByText('Current theme · Already active')).toBeVisible();
    expect(onSelectThemeMode).not.toHaveBeenCalled();
    expect(onSelectThemePreset).not.toHaveBeenCalled();
  });

  it('marks active appearance mode commands as current', () => {
    renderPalette({
      state: { mode: 'commands', open: true, search: 'dark' },
      themeMode: 'dark',
    });

    expect(screen.getByText('Current appearance')).toBeInTheDocument();
    expect(screen.getByText('Current appearance · Already active')).toBeVisible();
  });

  it('opens onboarding from the Connect HackMD account command', () => {
    const onConnectHackmd = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({
      hasHackmdApiToken: false,
      onConnectHackmd,
      onStateChange,
      state: { mode: 'commands', open: true, search: 'connect' },
    });

    expect(screen.getByText('Account')).toBeVisible();
    const command = screen.getByRole('option', { name: /Connect HackMD/ });

    fireEvent.click(command);

    expect(onConnectHackmd).toHaveBeenCalledOnce();
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
  });

  it('requests confirmation from the Disconnect HackMD account command', () => {
    const onRequestDisconnectHackmd = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({
      hasHackmdApiToken: true,
      onRequestDisconnectHackmd,
      onStateChange,
      state: { mode: 'commands', open: true, search: 'disconnect' },
    });

    const command = screen.getByRole('option', { name: /Disconnect HackMD/ });

    fireEvent.click(command);

    expect(onRequestDisconnectHackmd).toHaveBeenCalledOnce();
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
  });

  it('runs Local Vault commands based on configuration state', () => {
    const onOpenLocalFolder = vi.fn();
    const openLocal = renderPalette({
      hasLocalVault: false,
      onOpenLocalFolder,
      state: { mode: 'commands', open: true, search: 'local' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Open Local Folder/ }));

    expect(onOpenLocalFolder).toHaveBeenCalledOnce();
    expect(openLocal.onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
  });

  it('switches to a configured Local Vault from the Local command', () => {
    const onSwitchLocalVault = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({
      hasLocalVault: true,
      onStateChange,
      onSwitchLocalVault,
      state: { mode: 'commands', open: true, search: 'vault' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Switch to Local Vault/ }));

    expect(onSwitchLocalVault).toHaveBeenCalledOnce();
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
  });

  it('copies the current note link from current note commands', () => {
    const onCopyCurrentNoteLink = vi.fn();
    renderPalette({
      onCopyCurrentNoteLink,
      state: { mode: 'commands', open: true, search: 'copy link' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Copy Note Link/ }));

    expect(onCopyCurrentNoteLink).toHaveBeenCalledOnce();
  });

  it('copies the current note markdown link from current note commands', () => {
    const onCopyCurrentNoteMarkdownLink = vi.fn();
    renderPalette({
      onCopyCurrentNoteMarkdownLink,
      state: { mode: 'commands', open: true, search: 'markdown link' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Copy Markdown Link/ }));

    expect(onCopyCurrentNoteMarkdownLink).toHaveBeenCalledOnce();
  });

  it('opens sharing for remote current notes only', () => {
    const onShareCurrentNote = vi.fn();
    renderPalette({
      currentNoteIsRemote: true,
      onShareCurrentNote,
      state: { mode: 'commands', open: true, search: 'share' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Share Note…/ }));

    expect(onShareCurrentNote).toHaveBeenCalledOnce();
  });

  it('hides sharing for local current notes', () => {
    renderPalette({
      currentNoteIsRemote: false,
      state: { mode: 'commands', open: true, search: 'share' },
    });

    expect(screen.queryByRole('option', { name: /Share Note…/ })).not.toBeInTheDocument();
  });

  it('keeps keyboard selection, action shortcuts, and close reset behavior', async () => {
    const onRunAction = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({
      onRunAction,
      onStateChange,
      state: { mode: 'commands', open: true, search: 'new note' },
    });

    const input = screen.getByRole('combobox', { name: 'Search notes, folders, and commands' });
    const action = screen.getByRole('option', { name: /New Note/ });
    expect(action).toHaveAttribute('aria-selected', 'true');
    expect(within(action).getByText('⌘N')).toBeVisible();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRunAction).toHaveBeenCalledWith('new-note');
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' }));
  });

  it('shows customized action shortcuts in command results', () => {
    renderPalette({
      platform: 'darwin',
      shortcuts: {
        'new-note': 'mod+j',
      },
      state: { mode: 'commands', open: true, search: 'new note' },
    });

    const action = screen.getByRole('option', { name: /New Note/ });
    expect(within(action).getByText('⌘J')).toBeVisible();
    expect(within(action).queryByText('⌘N')).not.toBeInTheDocument();
  });

  it('selects notes from Quick Open and resets to command mode on close', () => {
    const onSelectNote = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({
      onSelectNote,
      onStateChange,
      state: { mode: 'quick-open', open: true, search: 'Alpha Plan' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Alpha Plan/ }));

    expect(onSelectNote).toHaveBeenCalledOnce();
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
  });
});
