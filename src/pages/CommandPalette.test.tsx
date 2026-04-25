import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useTheme } from '@/components/theme-provider';
import { useCreateHackmdNote, useDeleteHackmdNote, useHackmdNotes, useHackmdProfile, useHackmdTeams } from '@/lib/hackmd';
import { useSettings } from '@/lib/query';
import { Cmd } from '@/constants';
import { CommandPalette } from './CommandPalette';

const useSettingsMock = useSettings as unknown as ReturnType<typeof vi.fn>;
const useHackmdNotesMock = useHackmdNotes as unknown as ReturnType<typeof vi.fn>;
const useHackmdProfileMock = useHackmdProfile as unknown as ReturnType<typeof vi.fn>;
const useHackmdTeamsMock = useHackmdTeams as unknown as ReturnType<typeof vi.fn>;
const useCreateHackmdNoteMock = useCreateHackmdNote as unknown as ReturnType<typeof vi.fn>;
const useDeleteHackmdNoteMock = useDeleteHackmdNote as unknown as ReturnType<typeof vi.fn>;
const useThemeMock = useTheme as unknown as ReturnType<typeof vi.fn>;
const getCurrentWebviewWindowMock = getCurrentWebviewWindow as unknown as ReturnType<typeof vi.fn>;
const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/components/theme-provider', () => ({
  useTheme: vi.fn(),
}));

vi.mock('@/lib/query', () => ({
  useSettings: vi.fn(),
}));

vi.mock('@/lib/hackmd', () => ({
  getHackmdErrorMessage: vi.fn((error: Error) => error.message),
  getHackmdNotePath: vi.fn((note: { userPath?: string | null; teamPath?: string | null; permalink?: string | null; shortId: string; publishLink?: string | null }, editMode = false) => {
    if (note.teamPath && note.publishLink) {
      const pathname = new URL(note.publishLink).pathname;
      return editMode ? `${pathname}/edit` : pathname;
    }

    const namePath = note.userPath || note.teamPath;
    const path = namePath ? `/@${namePath}/${note.permalink || note.shortId}` : `/${note.shortId}`;
    return editMode ? `${path}/edit` : path;
  }),
  getHackmdProfilePath: vi.fn((userPath?: string | null) => {
    const normalizedUserPath = userPath?.trim() ?? '';
    return normalizedUserPath ? `/@${normalizedUserPath}` : null;
  }),
  normalizeHackmdToken: vi.fn((token: string) => token.trim()),
  useCreateHackmdNote: vi.fn(),
  useDeleteHackmdNote: vi.fn(),
  useHackmdNotes: vi.fn(),
  useHackmdProfile: vi.fn(),
  useHackmdTeams: vi.fn(),
}));

function getSelectedCommandItem() {
  return document.querySelector('[cmdk-item][aria-selected="true"]');
}

function isRenderedBefore(left: Element, right: Element) {
  return Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function getStoredRecentNotes() {
  const recentNotes = window.localStorage.getItem('hackdesk_recent_notes');
  return recentNotes ? JSON.parse(recentNotes) : [];
}

function openManageNotes() {
  fireEvent.click(screen.getByText('Manage Notes'));
}

function openManageNotesTeamWorkspaces() {
  fireEvent.click(screen.getByText('Team Workspaces…'));
}

function selectManageNotesTeam(teamName = 'Engineering') {
  openManageNotesTeamWorkspaces();
  fireEvent.click(screen.getByText(teamName));
}

describe('CommandPalette page', () => {
  const close = vi.fn();
  const setTheme = vi.fn();
  const refetchNotes = vi.fn();
  const refetchTeams = vi.fn();
  const createNote = vi.fn();
  const deleteNote = vi.fn();
  const personalNote = {
    id: 'note-1',
    title: 'Roadmap',
    tags: ['product'],
    lastChangedAt: '2026-04-18T00:00:00.000Z',
    createdAt: '2026-04-18T00:00:00.000Z',
    lastChangeUser: null,
    publishType: 'edit',
    publishedAt: null,
    userPath: 'michael',
    teamPath: null,
    permalink: 'roadmap',
    shortId: 'abc123',
    publishLink: 'https://hackmd.io/abc123',
    readPermission: 'guest',
    writePermission: 'signed_in',
  };
  const teamNote = {
    id: 'team-note-1',
    title: 'Engineering Plan',
    tags: ['team'],
    lastChangedAt: '2026-04-19T00:00:00.000Z',
    createdAt: '2026-04-19T00:00:00.000Z',
    lastChangeUser: null,
    publishType: 'view',
    publishedAt: null,
    userPath: null,
    teamPath: 'engineering',
    permalink: 'team-roadmap',
    shortId: 'team123',
    publishLink: 'https://hackmd.io/@engineering/team-roadmap',
    readPermission: 'guest',
    writePermission: 'signed_in',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: '' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);
    useHackmdProfileMock.mockReturnValue({
      data: null,
      error: null,
      isError: false,
      isPending: false,
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);
    useCreateHackmdNoteMock.mockReturnValue({
      isPending: false,
      mutateAsync: createNote,
    } as never);
    useDeleteHackmdNoteMock.mockReturnValue({
      isPending: false,
      mutateAsync: deleteNote,
    } as never);
    useThemeMock.mockReturnValue({
      theme: 'dark',
      setTheme,
    } as never);
    getCurrentWebviewWindowMock.mockReturnValue({
      close,
    } as never);
    invokeMock.mockResolvedValue(undefined);
  });

  it('shows recent commands from storage', () => {
    window.localStorage.setItem('hackdesk_recent_commands', JSON.stringify(['reload']));

    render(<CommandPalette />);

    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getAllByText('Reload')[0]).toBeInTheDocument();
  });

  it('filters commands by search term', () => {
    render(<CommandPalette />);

    fireEvent.change(screen.getByPlaceholderText('Search commands...'), {
      target: { value: 'trash' },
    });

    expect(screen.getByText('Go to my trash')).toBeInTheDocument();
    expect(screen.queryByText('Go to my notes')).not.toBeInTheDocument();
  });

  it('cycles to the last root command when pressing ArrowUp from the first item', () => {
    render(<CommandPalette />);

    const input = screen.getByPlaceholderText('Search commands...');

    expect(getSelectedCommandItem()).toHaveTextContent('New Note');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(getSelectedCommandItem()).toHaveTextContent('Toggle Theme');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(setTheme).toHaveBeenCalledWith('light');
    expect(close).toHaveBeenCalled();
  });

  it('executes selected actions and remembers them', () => {
    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Reload'));

    expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
      action: { type: 'Reload' },
    });
    expect(window.localStorage.getItem('hackdesk_recent_commands')).toContain('reload');
    expect(close).toHaveBeenCalled();
  });

  it('opens local HackDesk settings from root commands', async () => {
    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Open HackDesk Settings'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('open_settings_window');
      expect(close).toHaveBeenCalled();
    });
  });

  it('opens the note agent window from root commands', async () => {
    render(<CommandPalette />);

    expect(screen.getByText(/⌘\s*⇧\s*I/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ask agent about current note'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.OPEN_AGENT_WINDOW);
      expect(window.localStorage.getItem('hackdesk_agent_launch_intent')).toBe('ask');
      expect(close).toHaveBeenCalled();
    });
  });

  it('opens the my settings submenu from root commands', () => {
    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Go to my settings'));

    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getByText('Go to API settings')).toBeInTheDocument();
    expect(screen.getByText('Go to appearance settings')).toBeInTheDocument();
  });

  it('navigates to a settings section from the my settings submenu', async () => {
    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Go to my settings'));
    fireEvent.click(screen.getByText('Go to general settings'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/settings#general' },
        },
      });
      expect(close).toHaveBeenCalled();
    });
  });

  it('navigates to a HackMD settings subroute from root commands', async () => {
    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Go to my settings'));
    fireEvent.click(screen.getByText('Go to API settings'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/settings#api' },
        },
      });
      expect(close).toHaveBeenCalled();
    });
  });

  it('closes on Escape', () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(close).toHaveBeenCalled();
  });

  it('shows HackMD notes when a token is configured', () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);

    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Manage Notes'));

    expect(screen.getByText('Roadmap')).toBeInTheDocument();
  });

  it('shows a profile command when HackMD profile data is available', async () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdProfileMock.mockReturnValue({
      data: {
        id: 'user-1',
        email: 'michael@example.com',
        name: 'Michael',
        userPath: 'michael',
        photo: 'https://example.com/avatar.png',
        upgraded: true,
      },
      error: null,
      isError: false,
      isPending: false,
    } as never);

    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Go to my profile'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/@michael' },
        },
      });
      expect(close).toHaveBeenCalled();
    });
  });

  it('collects a root search query before navigating to HackMD search', async () => {
    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Search my notes'));
    fireEvent.change(screen.getByPlaceholderText('Search my notes...'), {
      target: { value: 'Roadmap draft' },
    });
    fireEvent.click(screen.getByText('Search for “Roadmap draft” in my notes'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/?nav=search&q=Roadmap%20draft' },
        },
      });
      expect(close).toHaveBeenCalled();
    });
  });

  it('opens a selected HackMD note in the main window', async () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);

    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Manage Notes'));
    fireEvent.click(screen.getByText('Roadmap'));
    fireEvent.click(screen.getByText('Open Note'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/@michael/roadmap' },
        },
      });
      expect(close).toHaveBeenCalled();
      expect(getStoredRecentNotes()).toEqual([
        {
          noteId: 'note-1',
          teamPath: null,
        },
      ]);
    });
  });

  it('opens a personal recent note directly from the recent section', async () => {
    window.localStorage.setItem('hackdesk_recent_notes', JSON.stringify(['note-1']));
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);

    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Manage Notes'));
    fireEvent.click(screen.getByText('Roadmap'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/@michael/roadmap' },
        },
      });
      expect(close).toHaveBeenCalled();
    });

    expect(screen.queryByText('Open Note')).not.toBeInTheDocument();
  });

  it('shows team workspaces inside manage notes', () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);

    render(<CommandPalette />);

    openManageNotes();

    expect(screen.getByText('My Workspace')).toBeInTheDocument();
    expect(screen.getByText('Team Workspaces…')).toBeInTheDocument();
    expect(screen.queryByText('Engineering')).not.toBeInTheDocument();

    openManageNotesTeamWorkspaces();

    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });

  it('renders recent notes before workspaces when not searching', () => {
    window.localStorage.setItem('hackdesk_recent_notes', JSON.stringify(['note-1']));
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: Array.from({ length: 6 }, (_, index) => ({
        id: `team-${index + 1}`,
        ownerId: 'owner-1',
        name: `Team ${String(index + 1).padStart(2, '0')}`,
        logo: 'https://example.com/logo.png',
        path: `team-${index + 1}`,
        description: 'Workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      })),
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);

    render(<CommandPalette />);

    openManageNotes();

    expect(isRenderedBefore(screen.getByText('Recent Notes'), screen.getByText('Workspaces'))).toBe(true);
    expect(isRenderedBefore(screen.getByText('Roadmap'), screen.getByText('Back to Commands'))).toBe(true);
  });

  it('highlights the first item when opening manage notes', async () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);

    render(<CommandPalette />);

    openManageNotes();

    await waitFor(() => {
      expect(getSelectedCommandItem()).toHaveTextContent('Back to Commands');
    });
  });

  it('goes back to root when pressing Backspace in manage notes with an empty search', () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);

    render(<CommandPalette />);

    openManageNotes();

    fireEvent.keyDown(screen.getByPlaceholderText('Search your notes or type a title to create one...'), {
      key: 'Backspace',
    });

    expect(screen.getByPlaceholderText('Search commands...')).toBeInTheDocument();
  });

  it('goes back to manage notes when pressing Backspace in team workspaces with an empty search', () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);

    render(<CommandPalette />);

    openManageNotes();
    openManageNotesTeamWorkspaces();

    fireEvent.keyDown(screen.getByPlaceholderText('Search team workspaces...'), {
      key: 'Backspace',
    });

    expect(screen.getByText('My Workspace')).toBeInTheDocument();
    expect(screen.queryByText('Back to Notes')).not.toBeInTheDocument();
  });

  it('does not go back when Backspace is pressed with a submenu search query', () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: Array.from({ length: 8 }, (_, index) => ({
        id: `team-${index + 1}`,
        ownerId: 'owner-1',
        name: `Team ${String(index + 1).padStart(2, '0')}`,
        logo: 'https://example.com/logo.png',
        path: `team-${index + 1}`,
        description: 'Workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      })),
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);

    render(<CommandPalette />);

    openManageNotes();
    openManageNotesTeamWorkspaces();

    const input = screen.getByPlaceholderText('Search team workspaces...');

    fireEvent.change(input, {
      target: { value: '08' },
    });
    fireEvent.keyDown(input, { key: 'Backspace' });

    expect(screen.getByText('Back to Notes')).toBeInTheDocument();
    expect(screen.getByText('Team 08')).toBeInTheDocument();
    expect(screen.queryByText('My Workspace')).not.toBeInTheDocument();
  });

  it('hides recent notes and keeps create visible when searching', () => {
    window.localStorage.setItem('hackdesk_recent_notes', JSON.stringify(['note-1']));
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);

    render(<CommandPalette />);

    openManageNotes();
    fireEvent.change(screen.getByPlaceholderText('Search your notes or type a title to create one...'), {
      target: { value: 'Sprint Plan' },
    });

    expect(screen.queryByText('Recent Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();
    expect(screen.getByText('Create “Sprint Plan”')).toBeInTheDocument();
  });

  it('cycles to the last selectable note item and skips disabled rows in notes mode', async () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);

    render(<CommandPalette />);

    openManageNotes();

    const input = screen.getByPlaceholderText('Search your notes or type a title to create one...');
    expect(getSelectedCommandItem()).toHaveTextContent('Back to Commands');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(getSelectedCommandItem()).toHaveTextContent('My Workspace');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(getSelectedCommandItem()).toHaveTextContent('Back to Commands');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(getSelectedCommandItem()).toHaveTextContent('Roadmap');
  });

  it('supports arrow navigation in the selected note actions view', async () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdNotesMock.mockReturnValue({
      data: [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never);

    render(<CommandPalette />);

    openManageNotes();
    fireEvent.click(screen.getByText('Roadmap'));

    const input = screen.getByPlaceholderText('Choose an action...');

    await waitFor(() => {
      expect(getSelectedCommandItem()).toHaveTextContent('Back to Notes');
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(getSelectedCommandItem()).toHaveTextContent('Open Note');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(getSelectedCommandItem()).toHaveTextContent('Back to Notes');
  });

  it('switches to a team workspace and shows that teams notes', () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);
    useHackmdNotesMock.mockImplementation((_, __, teamPath: string | null | undefined) => ({
      data: teamPath === 'engineering' ? [teamNote] : [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never));

    render(<CommandPalette />);

    openManageNotes();
    selectManageNotesTeam();

    expect(screen.getByText('Engineering Plan')).toBeInTheDocument();
    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();
  });

  it('opens team navigation without enabling the notes query', () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);

    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Team Navigation'));

    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.queryByText('Manage Workspace')).not.toBeInTheDocument();
    expect(useHackmdNotesMock.mock.calls.every(([, enabled]) => enabled === false)).toBe(true);
  });

  it('navigates to a selected team destination from team navigation', async () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);

    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Team Navigation'));
    fireEvent.click(screen.getByText('Engineering'));
    fireEvent.click(screen.getByText('Manage Workspace'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/team/engineering/manage' },
        },
      });
      expect(close).toHaveBeenCalled();
    });
  });

  it('collects a team search query before navigating to team search', async () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);

    render(<CommandPalette />);

    fireEvent.click(screen.getByText('Team Navigation'));
    fireEvent.click(screen.getByText('Engineering'));
    fireEvent.click(screen.getByText('Search'));
    fireEvent.change(screen.getByPlaceholderText('Search Engineering notes...'), {
      target: { value: 'Sprint plan' },
    });
    fireEvent.click(screen.getByText('Search for “Sprint plan” in Engineering'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/team/engineering?nav=search&q=Sprint%20plan' },
        },
      });
      expect(close).toHaveBeenCalled();
    });
  });

  it('shows team recent notes above workspaces in the active team scope', () => {
    window.localStorage.setItem('hackdesk_recent_notes', JSON.stringify([
      {
        noteId: 'team-note-1',
        teamPath: 'engineering',
      },
      {
        noteId: 'note-1',
        teamPath: null,
      },
    ]));
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);
    useHackmdNotesMock.mockImplementation((_, __, teamPath: string | null | undefined) => ({
      data: teamPath === 'engineering' ? [teamNote] : [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never));

    render(<CommandPalette />);

    openManageNotes();
    selectManageNotesTeam();

    expect(screen.getByText('Recent Notes in Engineering')).toBeInTheDocument();
    expect(isRenderedBefore(screen.getByText('Engineering Plan'), screen.getByText('Back to Commands'))).toBe(true);
    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();
  });

  it('opens a team recent note directly from the recent section', async () => {
    window.localStorage.setItem('hackdesk_recent_notes', JSON.stringify([
      {
        noteId: 'team-note-1',
        teamPath: 'engineering',
      },
    ]));
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);
    useHackmdNotesMock.mockImplementation((_, __, teamPath: string | null | undefined) => ({
      data: teamPath === 'engineering' ? [teamNote] : [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never));

    render(<CommandPalette />);

    openManageNotes();
    selectManageNotesTeam();
    fireEvent.click(screen.getByText('Engineering Plan'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/@engineering/team-roadmap' },
        },
      });
      expect(close).toHaveBeenCalled();
    });

    expect(screen.queryByText('Open Note')).not.toBeInTheDocument();
  });

  it('opens team notes and shows delete actions', async () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);
    useHackmdNotesMock.mockImplementation((_, __, teamPath: string | null | undefined) => ({
      data: teamPath === 'engineering' ? [teamNote] : [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never));

    render(<CommandPalette />);

    openManageNotes();
    selectManageNotesTeam();
    fireEvent.click(screen.getByText('Engineering Plan'));

    expect(screen.getByText('Open Note')).toBeInTheDocument();
    expect(screen.getByText('Delete Note')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Note'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/@engineering/team-roadmap' },
        },
      });
      expect(close).toHaveBeenCalled();
    });
  });

  it('deletes a team note from the active team scope', async () => {
    deleteNote.mockResolvedValue(undefined);
    window.localStorage.setItem('hackdesk_recent_notes', JSON.stringify([
      {
        noteId: 'note-1',
        teamPath: null,
      },
    ]));
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);
    useHackmdNotesMock.mockImplementation((_, __, teamPath: string | null | undefined) => ({
      data: teamPath === 'engineering' ? [teamNote] : [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never));

    render(<CommandPalette />);

    openManageNotes();
    selectManageNotesTeam();
    fireEvent.click(screen.getByText('Engineering Plan'));
    fireEvent.click(screen.getByText('Delete Note'));
    fireEvent.click(screen.getByText('Yes, Delete Note'));

    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledWith('team-note-1');
      expect(close).not.toHaveBeenCalled();
      expect(getStoredRecentNotes()).toEqual([
        {
          noteId: 'note-1',
          teamPath: null,
        },
      ]);
    });
  });

  it('creates a team note from the active team scope', async () => {
    createNote.mockResolvedValue(teamNote);
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);
    useHackmdNotesMock.mockImplementation((_, __, teamPath: string | null | undefined) => ({
      data: teamPath === 'engineering' ? [] : [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never));

    render(<CommandPalette />);

    openManageNotes();
    selectManageNotesTeam();
    fireEvent.change(screen.getByPlaceholderText('Search Engineering notes or type a title to create one...'), {
      target: { value: 'Sprint Plan' },
    });
    fireEvent.click(screen.getByText('Create “Sprint Plan” in Engineering'));

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith('Sprint Plan');
      expect(invokeMock).toHaveBeenCalledWith(Cmd.EXECUTE_ACTION, {
        action: {
          type: 'Navigate',
          data: { path: '/@engineering/team-roadmap/edit' },
        },
      });
      expect(close).toHaveBeenCalled();
      expect(getStoredRecentNotes()).toEqual([
        {
          noteId: 'team-note-1',
          teamPath: 'engineering',
        },
      ]);
    });
  });

  it('shows personal and team recents only in their matching scopes', () => {
    window.localStorage.setItem('hackdesk_recent_notes', JSON.stringify([
      {
        noteId: 'note-1',
        teamPath: null,
      },
      {
        noteId: 'team-note-1',
        teamPath: 'engineering',
      },
    ]));
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: [{
        id: 'team-1',
        ownerId: 'owner-1',
        name: 'Engineering',
        logo: 'https://example.com/logo.png',
        path: 'engineering',
        description: 'Engineering workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      }],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);
    useHackmdNotesMock.mockImplementation((_, __, teamPath: string | null | undefined) => ({
      data: teamPath === 'engineering' ? [teamNote] : [personalNote],
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchNotes,
    } as never));

    render(<CommandPalette />);

    openManageNotes();

    expect(screen.getByText('Recent Notes')).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(screen.queryByText('Engineering Plan')).not.toBeInTheDocument();

    selectManageNotesTeam();

    expect(screen.getByText('Recent Notes in Engineering')).toBeInTheDocument();
    expect(screen.getByText('Engineering Plan')).toBeInTheDocument();
    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();
  });

  it('filters team workspaces in the second layer', () => {
    useSettingsMock.mockReturnValue({
      data: { title: 'HackDesk', hackmdApiToken: 'secret-token' },
    } as never);
    useHackmdTeamsMock.mockReturnValue({
      data: Array.from({ length: 8 }, (_, index) => ({
        id: `team-${index + 1}`,
        ownerId: 'owner-1',
        name: `Team ${String(index + 1).padStart(2, '0')}`,
        logo: 'https://example.com/logo.png',
        path: `team-${index + 1}`,
        description: 'Workspace',
        visibility: 'private',
        createdAt: '2026-04-19T00:00:00.000Z',
        upgraded: true,
      })),
      error: null,
      isError: false,
      isPending: false,
      refetch: refetchTeams,
    } as never);

    render(<CommandPalette />);

    openManageNotes();
    openManageNotesTeamWorkspaces();
    fireEvent.change(screen.getByPlaceholderText('Search team workspaces...'), {
      target: { value: '08' },
    });

    expect(screen.getByText('Team 08')).toBeInTheDocument();
    expect(screen.queryByText('Team 01')).not.toBeInTheDocument();
  });
});