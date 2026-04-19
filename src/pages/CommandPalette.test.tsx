import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useTheme } from '@/components/theme-provider';
import { useCreateHackmdNote, useDeleteHackmdNote, useHackmdNotes, useHackmdTeams } from '@/lib/hackmd';
import { useSettings } from '@/lib/query';
import { Cmd } from '@/constants';
import { CommandPalette } from './CommandPalette';

const useSettingsMock = useSettings as unknown as ReturnType<typeof vi.fn>;
const useHackmdNotesMock = useHackmdNotes as unknown as ReturnType<typeof vi.fn>;
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
  normalizeHackmdToken: vi.fn((token: string) => token.trim()),
  useCreateHackmdNote: vi.fn(),
  useDeleteHackmdNote: vi.fn(),
  useHackmdNotes: vi.fn(),
  useHackmdTeams: vi.fn(),
}));

function getSelectedCommandItem() {
  return document.querySelector('[cmdk-item][aria-selected="true"]');
}

function isRenderedBefore(left: Element, right: Element) {
  return Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
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
    });
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

    fireEvent.click(screen.getByText('Manage Notes'));

    expect(screen.getByText('Personal Notes')).toBeInTheDocument();
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

    fireEvent.click(screen.getByText('Manage Notes'));

    expect(isRenderedBefore(screen.getByText('Recent Notes'), screen.getByText('Workspaces'))).toBe(true);
    expect(isRenderedBefore(screen.getByText('Roadmap'), screen.getByText('Back to Commands'))).toBe(true);
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

    fireEvent.click(screen.getByText('Manage Notes'));
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

    fireEvent.click(screen.getByText('Manage Notes'));

    const input = screen.getByPlaceholderText('Search your notes or type a title to create one...');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(getSelectedCommandItem()).toHaveTextContent('Back to Commands');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(getSelectedCommandItem()).toHaveTextContent('Roadmap');
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

    fireEvent.click(screen.getByText('Manage Notes'));
    fireEvent.click(screen.getByText('Engineering'));

    expect(screen.getByText('Engineering Plan')).toBeInTheDocument();
    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();
  });

  it('shows team recent notes above workspaces in the active team scope', () => {
    window.localStorage.setItem('hackdesk_recent_notes', JSON.stringify(['team-note-1']));
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

    fireEvent.click(screen.getByText('Manage Notes'));
    fireEvent.click(screen.getByText('Engineering'));

    expect(screen.getByText('Recent Notes')).toBeInTheDocument();
    expect(isRenderedBefore(screen.getByText('Engineering Plan'), screen.getByText('Back to Commands'))).toBe(true);
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

    fireEvent.click(screen.getByText('Manage Notes'));
    fireEvent.click(screen.getByText('Engineering'));
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
    window.localStorage.setItem('hackdesk_recent_notes', JSON.stringify(['team-note-1']));
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

    fireEvent.click(screen.getByText('Manage Notes'));
    fireEvent.click(screen.getByText('Engineering'));
    fireEvent.click(screen.getByText('Engineering Plan'));
    fireEvent.click(screen.getByText('Delete Note'));
    fireEvent.click(screen.getByText('Yes, Delete Note'));

    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledWith('team-note-1');
      expect(close).not.toHaveBeenCalled();
      expect(window.localStorage.getItem('hackdesk_recent_notes')).not.toContain('team-note-1');
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

    fireEvent.click(screen.getByText('Manage Notes'));
    fireEvent.click(screen.getByText('Engineering'));
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
    });
  });

  it('renders the create action before the team list when searching in notes mode', () => {
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

    fireEvent.click(screen.getByText('Manage Notes'));
    fireEvent.change(screen.getByPlaceholderText('Search your notes or type a title to create one...'), {
      target: { value: 'Sprint Plan' },
    });

    const createItem = screen.getByText('Create “Sprint Plan”');
    const firstTeam = screen.getByText('Team 01');

    expect(isRenderedBefore(createItem, firstTeam)).toBe(true);
  });
});