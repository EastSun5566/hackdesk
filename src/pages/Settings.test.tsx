import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useValidateHackmdToken } from '@/lib/hackmd';
import { useSettings, useUpdateSettings } from '@/lib/query';
import { useTheme } from '@/components/theme-provider';
import { Settings } from './Settings';

const useValidateHackmdTokenMock = useValidateHackmdToken as unknown as ReturnType<typeof vi.fn>;
const useSettingsMock = useSettings as unknown as ReturnType<typeof vi.fn>;
const useUpdateSettingsMock = useUpdateSettings as unknown as ReturnType<typeof vi.fn>;
const useThemeMock = useTheme as unknown as ReturnType<typeof vi.fn>;
const getCurrentWebviewWindowMock = getCurrentWebviewWindow as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/lib/hackmd', () => ({
  useValidateHackmdToken: vi.fn(),
}));

vi.mock('@/lib/query', () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
}));

vi.mock('@/components/theme-provider', () => ({
  useTheme: vi.fn(),
}));

describe('Settings page', () => {
  const mutate = vi.fn();
  const validateToken = vi.fn();
  const resetValidation = vi.fn();
  const setTheme = vi.fn();
  const close = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useValidateHackmdTokenMock.mockReturnValue({
      mutate: validateToken,
      data: undefined,
      error: null,
      isPending: false,
      isSuccess: false,
      reset: resetValidation,
    } as never);
    useSettingsMock.mockReturnValue({
      data: { title: 'Workspace', hackmdApiToken: '' },
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
        { title: 'Focus Desk', hackmdApiToken: '' },
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

  it('allows testing a HackMD API token from the HackMD tab', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByText('HackMD'));
    fireEvent.change(screen.getByLabelText('API Token'), {
      target: { value: 'hackmd-token' },
    });
    fireEvent.click(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(validateToken).toHaveBeenCalledWith(
        'hackmd-token',
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });
  });
});