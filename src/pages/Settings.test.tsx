import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useSettings, useUpdateSettings } from '@/lib/query';
import { useTheme } from '@/components/theme-provider';
import { Settings } from './Settings';

const useSettingsMock = useSettings as unknown as ReturnType<typeof vi.fn>;
const useUpdateSettingsMock = useUpdateSettings as unknown as ReturnType<typeof vi.fn>;
const useThemeMock = useTheme as unknown as ReturnType<typeof vi.fn>;
const getCurrentWebviewWindowMock = getCurrentWebviewWindow as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/lib/query', () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
}));

vi.mock('@/components/theme-provider', () => ({
  useTheme: vi.fn(),
}));

describe('Settings page', () => {
  const mutate = vi.fn();
  const setTheme = vi.fn();
  const close = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsMock.mockReturnValue({
      data: { title: 'Workspace' },
    } as never);
    useUpdateSettingsMock.mockReturnValue({
      mutate,
      isPending: false,
    } as never);
    useThemeMock.mockReturnValue({
      theme: 'system',
      setTheme,
    } as never);
    getCurrentWebviewWindowMock.mockReturnValue({
      close,
    } as never);
  });

  it('renders the current settings value', () => {
    render(<Settings />);

    expect(screen.getByDisplayValue('Workspace')).toBeInTheDocument();
  });

  it('submits the updated title as typed settings', async () => {
    render(<Settings />);

    fireEvent.change(screen.getByLabelText('Window Title'), {
      target: { value: 'Focus Desk' },
    });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(
        { title: 'Focus Desk' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });
  });

  it('switches theme from the appearance tab', () => {
    render(<Settings />);

    fireEvent.click(screen.getByText('Appearance'));
    fireEvent.click(screen.getByText('Dark'));

    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('closes the window on Escape', () => {
    render(<Settings />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(close).toHaveBeenCalled();
  });
});