import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ElectronActionContext } from '@/lib/electron-actions';
import type { FolderSummary, NoteSummary, TeamSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';
import * as quickOpen from '@/lib/electron-quick-open';
import * as noteFinder from '@/lib/electron-note-finder';
import { HACKDESK_THEME_PRESETS } from '@/lib/themes';

import { CommandPaletteDialog } from './CommandPaletteDialog';

const context: ElectronActionContext = {
  activeTabIsDraft: false,
  activePaneTabCount: 1,
  activePaneTabsToLeftCount: 0,
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
  bookOpen: false,
  bookContentsHidden: false,
  hasLocalVault: false,
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
    onMoveNoteToFolder: vi.fn(),
    onOpenSettingsTab: vi.fn(),
    onRequestDisconnectHackmd: vi.fn(),
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
    hasHackmdApiToken: true,
    hasLocalVault: true,
    platform: 'darwin',
    state: { mode: 'commands', open: true, search: '' },
    teams: [team],
    user: { name: 'Michael Lee', username: 'michael', photo: null },
    themeMode: 'system',
    themePresetId: 'hackmd-neo',
    themePresets: HACKDESK_THEME_PRESETS,
    onSelectThemeMode: vi.fn(),
    onSelectThemePreset: vi.fn(),
    ...overrides,
  };

  const view = render(<CommandPaletteDialog {...props} />);
  let currentProps = props;
  return {
    ...props,
    rerender: (update: Partial<CommandPaletteDialogProps>) => {
      currentProps = { ...currentProps, ...update };
      view.rerender(<CommandPaletteDialog {...currentProps} />);
    },
  };
}

describe('CommandPaletteDialog', () => {
  afterEach(() => vi.restoreAllMocks());

  it('skips closed searches and opens with data that changed while hidden', () => {
    const sort = vi.spyOn(noteFinder, 'sortNoteFinderEntries');
    const noteSearch = vi.spyOn(quickOpen, 'createQuickOpenNoteSearch');
    const folderSearch = vi.spyOn(quickOpen, 'createQuickOpenFolderSearch');
    const props = renderPalette({ state: { mode: 'commands', open: false, search: '' } });
    const updated = buildHackmdFolderTree([note({ id: 'fresh', title: 'Fresh note', updatedAtMillis: 500 })]);
    props.rerender({ folderTree: updated, state: { mode: 'commands', open: false, search: 'fresh' } });
    expect(sort).not.toHaveBeenCalled();
    expect(noteSearch).not.toHaveBeenCalled();
    expect(folderSearch).not.toHaveBeenCalled();

    props.rerender({ folderTree: updated, state: { mode: 'commands', open: true, search: 'fresh' } });
    const option = screen.getByRole('option', { name: /Fresh note/ });
    fireEvent.click(option);
    expect(props.onSelectNote).toHaveBeenCalledWith(updated.allNotes[0]);
  });

  it('reuses note and folder searches across queries and refreshes changed input', () => {
    const noteSearch = vi.spyOn(quickOpen, 'createQuickOpenNoteSearch');
    const folderSearch = vi.spyOn(quickOpen, 'createQuickOpenFolderSearch');
    const props = renderPalette({ state: { mode: 'quick-open', open: true, search: 'alpha' } });
    props.rerender({ state: { mode: 'quick-open', open: true, search: 'plan' } });
    props.rerender({ context: { ...context, noteDirty: true } });
    expect(noteSearch).toHaveBeenCalledTimes(1);
    expect(folderSearch).toHaveBeenCalledTimes(1);

    props.rerender({ folderTree: buildHackmdFolderTree([note({ id: 'new', title: 'New title' })]), state: { mode: 'quick-open', open: true, search: 'new' } });
    expect(screen.getByRole('option', { name: /New title/ })).toBeVisible();
    expect(noteSearch).toHaveBeenCalledTimes(2);
    expect(folderSearch).toHaveBeenCalledTimes(2);
    props.rerender({ recentNotes: [] });
    expect(noteSearch).toHaveBeenCalledTimes(3);
    expect(folderSearch).toHaveBeenCalledTimes(2);
  });

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
    expect(screen.getByTestId('command-palette-personal-avatar')).toHaveTextContent('ML');
    expect(screen.getByTestId(`command-palette-team-logo-${team.id}`)).toHaveTextContent('A');
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

  it('runs Emacs and experimental Kakoune editor mode commands', () => {
    const onRunAction = vi.fn();
    renderPalette({
      onRunAction,
      state: { mode: 'commands', open: true, search: 'editor mode' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Use Emacs Editor Mode/ }));
    expect(onRunAction).toHaveBeenCalledWith('set-editor-mode-emacs');

    fireEvent.click(screen.getByRole('option', { name: /Use Kakoune Editor Mode/ }));
    expect(onRunAction).toHaveBeenCalledWith('set-editor-mode-kakoune');
  });

  it('closes the palette and clears its search through the named close button', () => {
    const props = renderPalette({ state: { mode: 'commands', open: true, search: 'alpha' } });

    fireEvent.click(screen.getByRole('button', { name: 'Close command palette' }));

    expect(props.onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
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
      state: { mode: 'commands', open: true, search: 'noctis' },
    });

    expect(screen.getByText('Appearance')).toBeVisible();
    const command = screen.getByRole('option', { name: /Use Theme: Noctis/ });

    fireEvent.click(command);

    expect(onSelectThemePreset).toHaveBeenCalledWith('noctis');
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
  });

  it('does not show removed HackMD preset commands', () => {
    renderPalette({
      state: { mode: 'commands', open: true, search: 'nature' },
    });

    expect(screen.queryByText(/HackMD Nature/)).not.toBeInTheDocument();
    expect(screen.queryByText(/HackMD Minimal/)).not.toBeInTheDocument();
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

  it('offers Open Local Folder until a vault is set, then Change Local Vault', () => {
    const onRunAction = vi.fn();
    const onStateChange = vi.fn();
    const view = renderPalette({
      context: { ...context, hasLocalVault: false },
      onRunAction,
      onStateChange,
      state: { mode: 'commands', open: true, search: 'open local folder' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Open Local Folder…/ }));

    expect(onRunAction).toHaveBeenCalledWith('change-local-vault');
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
    view.rerender({ context: { ...context, hasLocalVault: true }, state: { mode: 'commands', open: true, search: 'vault' } });
    expect(screen.getByRole('option', { name: /Change Local Vault…/ })).toBeVisible();
  });

  it('switches to a configured Local Vault from Workspaces', () => {
    const onSelectWorkspace = vi.fn();
    renderPalette({ onSelectWorkspace, state: { mode: 'commands', open: true, search: 'vault' } });

    const workspaces = screen.getByRole('group', { name: 'Workspaces' });
    fireEvent.click(within(workspaces).getByRole('option', { name: /^Local Vault/ }));

    expect(onSelectWorkspace).toHaveBeenCalledWith(expect.objectContaining({ type: 'local' }));
  });

  it('leaves the Local Vault out of Workspaces until one is set', () => {
    renderPalette({ hasLocalVault: false, state: { mode: 'quick-open', open: true, search: 'vault' } });
    expect(screen.queryByRole('option', { name: /^Local Vault/ })).not.toBeInTheDocument();
  });

  it('tolerates typos in action commands', () => {
    renderPalette({ state: { mode: 'commands', open: true, search: 'setings' } });
    expect(screen.getAllByRole('option', { name: /Open Settings/ })[0]).toBeVisible();
  });

  it('tolerates adjacent transpositions in workspace names', () => {
    renderPalette({ state: { mode: 'commands', open: true, search: 'vualt' } });
    expect(screen.getByRole('option', { name: /^Local Vault/ })).toBeVisible();
  });

  it('runs note link and sharing actions, which explain when they do not apply', () => {
    const onRunAction = vi.fn();
    const view = renderPalette({ onRunAction, state: { mode: 'commands', open: true, search: 'copy link' } });

    fireEvent.click(screen.getByRole('option', { name: /Copy Note Link/ }));
    expect(onRunAction).toHaveBeenLastCalledWith('copy-note-link');

    view.rerender({ state: { mode: 'commands', open: true, search: 'markdown link' } });
    fireEvent.click(screen.getByRole('option', { name: /Copy Markdown Link/ }));
    expect(onRunAction).toHaveBeenLastCalledWith('copy-markdown-link');

    view.rerender({ state: { mode: 'commands', open: true, search: 'share' } });
    fireEvent.click(screen.getByRole('option', { name: /Share Note…/ }));
    expect(onRunAction).toHaveBeenLastCalledWith('share-note');

    view.rerender({ context: { ...context, scopeType: 'local' }, state: { mode: 'commands', open: true, search: 'share' } });
    const share = screen.getByRole('option', { name: /Share Note…/ });
    expect(share).toHaveAttribute('aria-disabled', 'true');
    expect(share).toHaveTextContent('Sharing is only available for HackMD notes.');
  });

  it('highlights the matched part of each result title', () => {
    renderPalette({ state: { mode: 'commands', open: true, search: 'nn' } });

    const newNote = screen.getByRole('option', { name: /^New Note(?! from)/ });
    expect([...newNote.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['N', 'N']);
  });

  it('highlights Chinese and multi-word matches, and nothing without a query', () => {
    const view = renderPalette({
      folderTree: buildHackmdFolderTree([note({ id: 'weekly', title: '產品週會紀錄' })], []),
      state: { mode: 'quick-open', open: true, search: '週會' },
    });
    expect(screen.getByRole('option', { name: /產品週會紀錄/ }).querySelector('mark')?.textContent).toBe('週會');

    view.rerender({ state: { mode: 'commands', open: true, search: 'tabs right' } });
    expect([...screen.getByRole('option', { name: /Close Tabs to Right/ }).querySelectorAll('mark')].map(mark => mark.textContent))
      .toEqual(['Tabs', 'Right']);

    view.rerender({ state: { mode: 'commands', open: true, search: '' } });
    expect(screen.getByRole('dialog').querySelector('mark')).toBeNull();
  });

  it('opens a Settings page from the Settings group', () => {
    const onOpenSettingsTab = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({ onOpenSettingsTab, onStateChange, state: { mode: 'commands', open: true, search: 'settings ai' } });

    fireEvent.click(screen.getByRole('option', { name: /Open Settings: AI/ }));

    expect(onOpenSettingsTab).toHaveBeenCalledWith('ai');
    expect(onStateChange).toHaveBeenCalledWith({ mode: 'commands', open: false, search: '' });
  });

  it('switches to the folder list from Move Note to Folder… without closing', () => {
    const onRunAction = vi.fn();
    const onStateChange = vi.fn();
    renderPalette({ onRunAction, onStateChange, state: { mode: 'commands', open: true, search: 'move note' } });

    fireEvent.click(screen.getByRole('option', { name: /Move Note to Folder…/ }));

    expect(onStateChange).toHaveBeenCalledWith({ mode: 'move-note', open: true, search: '' });
    expect(onStateChange).not.toHaveBeenCalledWith(expect.objectContaining({ open: false }));
    expect(onRunAction).not.toHaveBeenCalled();
  });

  it('lists every folder, including Root, to move the selected note to', () => {
    const onMoveNoteToFolder = vi.fn();
    const onSelectFolder = vi.fn();
    const view = renderPalette({ onMoveNoteToFolder, onSelectFolder, state: { mode: 'move-note', open: true, search: '' } });

    const group = screen.getByRole('group', { name: 'Move to' });
    expect(within(group).getAllByRole('option').map(option => option.textContent)).toEqual([
      expect.stringContaining('Root'),
      expect.stringContaining('Alpha Folder'),
    ]);
    expect(screen.queryByRole('group', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Workspaces' })).not.toBeInTheDocument();

    view.rerender({ state: { mode: 'move-note', open: true, search: 'alpha' } });
    fireEvent.click(screen.getByRole('option', { name: /Alpha Folder/ }));

    expect(onMoveNoteToFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'folder-alpha' }));
    expect(onSelectFolder).not.toHaveBeenCalled();
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
    const action = screen.getByRole('option', { name: /^New Note(?! from)/ });
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

    const action = screen.getByRole('option', { name: /^New Note(?! from)/ });
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
