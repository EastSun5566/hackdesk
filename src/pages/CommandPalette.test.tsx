import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useTheme } from '@/components/theme-provider';
import { useCreateHackmdNote, useDeleteHackmdNote, useHackmdNotes } from '@/lib/hackmd';
import { useSettings } from '@/lib/query';
import { Cmd } from '@/constants';
import { CommandPalette } from './CommandPalette';

const useSettingsMock = useSettings as unknown as ReturnType<typeof vi.fn>;
const useHackmdNotesMock = useHackmdNotes as unknown as ReturnType<typeof vi.fn>;
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
  getHackmdNotePath: vi.fn((note: { userPath: string; permalink: string }) => `/@${note.userPath}/${note.permalink}`),
  normalizeHackmdToken: vi.fn((token: string) => token.trim()),
  useCreateHackmdNote: vi.fn(),
  useDeleteHackmdNote: vi.fn(),
  useHackmdNotes: vi.fn(),
}));

describe('CommandPalette page', () => {
  const close = vi.fn();
  const setTheme = vi.fn();
  const refetchNotes = vi.fn();

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
    useCreateHackmdNoteMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as never);
    useDeleteHackmdNoteMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
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
      data: [
        {
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
        },
      ],
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
      data: [
        {
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
        },
      ],
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
});