import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@/lib/settings';
import { Settings } from './Settings';

const {
  useValidateHackmdTokenMock,
  useCheckForUpdatesMock,
  useSettingsMock,
  useUpdateSettingsMock,
  useThemeMock,
  getCurrentWebviewWindowMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  useValidateHackmdTokenMock: vi.fn(),
  useCheckForUpdatesMock: vi.fn(),
  useSettingsMock: vi.fn(),
  useUpdateSettingsMock: vi.fn(),
  useThemeMock: vi.fn(),
  getCurrentWebviewWindowMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: toastSuccessMock,
  },
}));

vi.mock('@/lib/hackmd', () => ({
  useValidateHackmdToken: useValidateHackmdTokenMock,
}));

vi.mock('@/lib/updater', () => ({
  useCheckForUpdates: useCheckForUpdatesMock,
}));

vi.mock('@/lib/query', () => ({
  useSettings: useSettingsMock,
  useUpdateSettings: useUpdateSettingsMock,
}));

vi.mock('@/components/theme-provider', () => ({
  useTheme: useThemeMock,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: getCurrentWebviewWindowMock,
}));

describe('Settings page', () => {
  const mutate = vi.fn();
  const checkForUpdates = vi.fn();
  const validateToken = vi.fn();
  const resetValidation = vi.fn();
  const setTheme = vi.fn();
  const setPresetId = vi.fn();
  const setCustomSeed = vi.fn();
  const setAppearance = vi.fn();
  const previewTheme = vi.fn();
  const cancelPreview = vi.fn();
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
      data: {
        title: 'Workspace',
        hackmdApiToken: '',
        appearance: {
          theme: 'system',
          presetId: 'hackmd',
          customSeed: {},
        },
        onboarding: defaultSettings.onboarding,
      },
    } as never);
    useCheckForUpdatesMock.mockReturnValue({
      mutate: checkForUpdates,
      isPending: false,
    } as never);
    useUpdateSettingsMock.mockReturnValue({
      mutate,
      isPending: false,
    } as never);
    useThemeMock.mockReturnValue({
      theme: 'system',
      resolvedMode: 'light',
      presetId: 'hackmd',
      customSeed: {},
      presets: [
        {
          id: 'hackmd',
          name: 'HackMD',
          description: 'The default HackDesk palette.',
          light: {
            neutral: '#71717A',
            primary: '#5D54E8',
            success: '#22C55E',
            warning: '#F59E0B',
            destructive: '#EF4444',
          },
          dark: {
            neutral: '#71717A',
            primary: '#A8A2FF',
            success: '#22C55E',
            warning: '#FBBF24',
            destructive: '#F87171',
          },
        },
        {
          id: 'forest',
          name: 'Forest',
          description: 'Green accent for long-form notes.',
          light: {
            neutral: '#6B7280',
            primary: '#15803D',
            success: '#16A34A',
            warning: '#CA8A04',
            destructive: '#DC2626',
          },
          dark: {
            neutral: '#94A3B8',
            primary: '#4ADE80',
            success: '#22C55E',
            warning: '#EAB308',
            destructive: '#FB7185',
          },
        },
      ],
      setTheme,
      setPresetId,
      setCustomSeed,
      setAppearance,
      previewTheme,
      commitPreview: vi.fn(),
      cancelPreview,
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
        {
          title: 'Focus Desk',
          hackmdApiToken: '',
          appearance: {
            theme: 'system',
            presetId: 'hackmd',
            customSeed: {},
          },
          onboarding: defaultSettings.onboarding,
          localVault: defaultSettings.localVault,
          editor: defaultSettings.editor,
        },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });
  });

  it('previews and applies theme changes from the appearance tab', () => {
    render(<Settings />);

    fireEvent.click(screen.getByText('Appearance'));
    fireEvent.click(screen.getByText('Dark'));

    expect(previewTheme).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
    expect(setTheme).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Apply Theme'));

    expect(setAppearance).toHaveBeenCalledWith({
      theme: 'dark',
      presetId: 'hackmd',
      customSeed: {},
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Theme applied');
  });

  it('shows inline validation for invalid custom theme seed colors', () => {
    render(<Settings />);

    fireEvent.click(screen.getByText('Appearance'));
    fireEvent.change(screen.getByLabelText('Primary'), {
      target: { value: 'blue' },
    });

    expect(screen.getByText('Use a 6-digit hex color, for example #5D54E8.')).toBeInTheDocument();
    expect(screen.getByText('Apply Theme')).toBeDisabled();
  });

  it('hides save and reset actions on non-form tabs', () => {
    render(<Settings />);

    fireEvent.click(screen.getByText('Appearance'));
    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
    expect(screen.queryByText('Reset')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Shortcuts'));
    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
    expect(screen.queryByText('Reset')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
    expect(screen.queryByText('Reset')).not.toBeInTheDocument();
  });

  it('renders shortcut rows from electron action metadata', () => {
    render(<Settings />);

    fireEvent.click(screen.getByText('Shortcuts'));

    const navigatorRow = screen.getByText('Toggle Note Navigator').closest('div');
    expect(navigatorRow).not.toBeNull();
    expect(within(navigatorRow as HTMLElement).getByText('⌥')).toBeInTheDocument();
    expect(within(navigatorRow as HTMLElement).getByText('⌘')).toBeInTheDocument();
    expect(within(navigatorRow as HTMLElement).getByText('B')).toBeInTheDocument();
    const backRow = screen.getByText('Back').closest('div');
    const forwardRow = screen.getByText('Forward').closest('div');
    expect(backRow).not.toBeNull();
    expect(forwardRow).not.toBeNull();
    expect(within(backRow as HTMLElement).getByText('⌘')).toBeInTheDocument();
    expect(within(backRow as HTMLElement).getByText('[')).toBeInTheDocument();
    expect(within(forwardRow as HTMLElement).getByText('⌘')).toBeInTheDocument();
    expect(within(forwardRow as HTMLElement).getByText(']')).toBeInTheDocument();
    expect(screen.getByText('Close Tab')).toBeInTheDocument();
  });

  it('closes the window on Escape', () => {
    render(<Settings />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(close).toHaveBeenCalled();
  });

  it('allows testing a HackMD API token from the HackMD tab', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByText('HackMD API'));
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

  it('allows checking for updates from the advanced tab', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByText('Advanced'));
    fireEvent.click(screen.getByText('Check for Updates'));

    await waitFor(() => {
      expect(checkForUpdates).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });
  });
});
