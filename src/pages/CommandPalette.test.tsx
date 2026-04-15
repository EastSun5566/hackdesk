import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useTheme } from '@/components/theme-provider';
import { Cmd } from '@/constants';
import { CommandPalette } from './CommandPalette';

const useThemeMock = useTheme as unknown as ReturnType<typeof vi.fn>;
const getCurrentWebviewWindowMock = getCurrentWebviewWindow as unknown as ReturnType<typeof vi.fn>;
const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/components/theme-provider', () => ({
  useTheme: vi.fn(),
}));

describe('CommandPalette page', () => {
  const hide = vi.fn();
  const setTheme = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useThemeMock.mockReturnValue({
      theme: 'dark',
      setTheme,
    } as never);
    getCurrentWebviewWindowMock.mockReturnValue({
      hide,
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
    expect(hide).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(hide).toHaveBeenCalled();
  });
});