import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSettings } from '@/lib/settings';

import {
  renderSettingsDialog,
} from './SettingsDialog.test-utils';

const {
  getHackDeskAPIMock,
  toastErrorMock,
  toastInfoMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  getHackDeskAPIMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    error: toastErrorMock,
    info: toastInfoMock,
    success: toastSuccessMock,
  },
}));

vi.mock('@/lib/electron-api', () => ({
  getHackDeskAPI: getHackDeskAPIMock,
}));

describe('SettingsDialog: shortcuts and updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHackDeskAPIMock.mockReturnValue(undefined);
    delete window.hackdeskAPI;
    window.localStorage.clear();
  });

  it('saves whether key hints show at once', () => {
    const { onSave } = renderSettingsDialog({ initialTab: 'shortcuts' });
    const toggle = screen.getByRole('switch', { name: 'Show key hints' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onSave).toHaveBeenCalledWith({ title: 'HackDesk', shortcuts: {}, keyboardNavigation: { characterShortcutsEnabled: true, keyHintsVisible: false } });
  });

  it('saves character navigation at once', async () => {
    const { onSave, rerenderSettingsDialog } = renderSettingsDialog({ initialTab: 'shortcuts' });
    const toggle = screen.getByRole('switch', { name: 'Enable ?, / and Space outside text editing' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onSave).toHaveBeenCalledWith({ title: 'HackDesk', shortcuts: {}, keyboardNavigation: { characterShortcutsEnabled: false, keyHintsVisible: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => { rerenderSettingsDialog({ open: false }); });
    await act(async () => { rerenderSettingsDialog({ open: true }); });
    expect(screen.getByRole('switch', { name: 'Enable ?, / and Space outside text editing' })).toBeChecked();
  });

  it('captures and saves shortcut overrides from the Shortcuts tab', async () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));
    expect(screen.getByLabelText('Search shortcuts')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'palette' } });
    expect(screen.getByText('Command Palette')).toBeVisible();

    const shortcutButton = screen.getByRole('button', { name: 'Set shortcut for Command Palette' });
    fireEvent.click(shortcutButton);
    await waitFor(() => expect(shortcutButton).toHaveTextContent('Press keys…'));
    fireEvent.keyDown(shortcutButton, { key: 'e', metaKey: true });

    await waitFor(() => expect(shortcutButton).toHaveTextContent('⌘E'));

    expect(onSave).toHaveBeenCalledWith({
      title: 'HackDesk',
      keyboardNavigation: { characterShortcutsEnabled: true, keyHintsVisible: true },
      shortcuts: {
        'open-command-palette': 'mod+e',
      },
    });
  });

  it('shows removed default shortcuts as unassigned', () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));
    fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'workspace' } });

    const row = screen.getByText('Switch Workspace…').closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole('button', { name: 'Set shortcut for Switch Workspace…' })).toHaveTextContent('Unassigned');
  });

  it('shows quick capture global shortcut registration status', async () => {
    const getQuickCaptureShortcutStatus = vi.fn(async () => ({
      shortcut: 'control+alt+h',
      registered: true,
    }));
    window.hackdeskAPI = {
      app: { getQuickCaptureShortcutStatus },
      platform: 'darwin',
    } as unknown as typeof window.hackdeskAPI;

    renderSettingsDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));

    const row = screen.getByText('Open or close Quick Hack').closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('⌃⌥H')).toBeVisible();
    expect(within(row as HTMLElement).getByText('Checking…')).toBeVisible();

    await waitFor(() => expect(within(row as HTMLElement).getByText('Global')).toBeVisible());
  });

  it('shows unavailable when the quick capture global shortcut is not registered', async () => {
    window.hackdeskAPI = {
      app: {
        getQuickCaptureShortcutStatus: vi.fn(async () => ({
          shortcut: 'control+alt+h',
          registered: false,
        })),
      },
      platform: 'darwin',
    } as unknown as typeof window.hackdeskAPI;

    renderSettingsDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));

    const row = screen.getByText('Open or close Quick Hack').closest('li');
    expect(row).not.toBeNull();
    await waitFor(() => expect(within(row as HTMLElement).getByText('Unavailable')).toBeVisible());
  });

  it('records the global Quick Hack hotkey and checks its registration again once saved', async () => {
    const savedSettings = {
      title: 'HackDesk',
      workspaceNavigation: defaultSettings.workspaceNavigation,
      appearance: defaultSettings.appearance,
      editor: defaultSettings.editor,
      hasHackmdApiToken: false,
      hackmdAccounts: { accounts: [], activeAccountId: null },
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      hasLocalVault: false,
      localVault: defaultSettings.localVault,
      onboarding: defaultSettings.onboarding,
      quickCapture: defaultSettings.quickCapture,
      shouldShowHackmdOnboarding: true,
    };
    let status = { shortcut: 'control+alt+h', registered: true };
    const getQuickCaptureShortcutStatus = vi.fn(async () => status);
    window.hackdeskAPI = { app: { getQuickCaptureShortcutStatus }, platform: 'darwin' } as unknown as typeof window.hackdeskAPI;
    const { onSave, rerenderSettingsDialog } = renderSettingsDialog({ settings: savedSettings });
    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));

    const row = screen.getByText('Open or close Quick Hack').closest('li') as HTMLElement;
    const hotkey = within(row).getByRole('button', { name: 'Set shortcut for Open or close Quick Hack' });
    await waitFor(() => expect(within(row).getByText('Global')).toBeVisible());
    expect(hotkey).toHaveTextContent('⌃⌥H');
    expect(within(row).getByRole('button', { name: 'Reset shortcut for Open or close Quick Hack' })).toBeDisabled();

    // The pin already has ⇧⌘P; the system would take it first.
    fireEvent.click(hotkey);
    await waitFor(() => expect(hotkey).toHaveTextContent('Press keys…'));
    fireEvent.keyDown(hotkey, { key: 'P', code: 'KeyP', metaKey: true, shiftKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('⇧⌘P is already assigned to Pin Quick Hack.');
    fireEvent.keyDown(hotkey, { key: 'F5', code: 'F5', shiftKey: true });
    expect(screen.getByRole('alert')).toHaveTextContent('so it does not take keys you type in other apps');

    // Option turns J into ∆ on macOS, but the hotkey belongs to the key.
    fireEvent.keyDown(hotkey, { key: '∆', code: 'KeyJ', ctrlKey: true, altKey: true });
    await waitFor(() => expect(hotkey).toHaveTextContent('⌃⌥J'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSave).toHaveBeenLastCalledWith({ title: 'HackDesk', quickCapture: { toggleShortcut: 'ctrl+alt+j' } });
    expect(within(row).getByText('Checking…')).toBeVisible();

    // Once main has applied the save, the row asks again whether the system took the keys.
    status = { shortcut: 'ctrl+alt+j', registered: false };
    rerenderSettingsDialog({ settings: { ...savedSettings, quickCapture: { ...savedSettings.quickCapture, toggleShortcut: 'ctrl+alt+j' } } });
    await waitFor(() => expect(within(row).getByText('Unavailable')).toBeVisible());
    expect(getQuickCaptureShortcutStatus).toHaveBeenCalledTimes(2);

    fireEvent.click(hotkey);
    await waitFor(() => expect(hotkey).toHaveTextContent('Press keys…'));
    fireEvent.keyDown(hotkey, { key: 'Backspace' });
    expect(onSave).toHaveBeenLastCalledWith({ title: 'HackDesk', quickCapture: { toggleShortcut: 'none' } });
    expect(hotkey).toHaveTextContent('Disabled');
    expect(within(row).getByText('Off')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Quick Hack shortcuts' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'HackDesk', quickCapture: { toggleShortcut: 'control+alt+h' } });
    expect(onSave).toHaveBeenLastCalledWith({ title: 'HackDesk', quickCapture: { pinShortcut: 'mod+shift+p' } });
    expect(hotkey).toHaveTextContent('⌃⌥H');
  });

  it('records the Pin Quick Hack shortcut into the Quick Hack settings', async () => {
    const { onSave } = renderSettingsDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));

    const pinButton = screen.getByRole('button', { name: 'Set shortcut for Pin Quick Hack' });
    expect(pinButton).toHaveTextContent('⇧⌘P');
    expect(screen.getByRole('button', { name: 'Reset shortcut for Pin Quick Hack' })).toBeDisabled();

    // Bold in the popup's editor: Quick Hack keeps it.
    fireEvent.click(pinButton);
    await waitFor(() => expect(pinButton).toHaveTextContent('Press keys…'));
    fireEvent.keyDown(pinButton, { key: 'b', metaKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('The Quick Hack editor already uses ⌘B.');
    // Shift alone would type into the note.
    fireEvent.keyDown(pinButton, { key: 'K', shiftKey: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Use a shortcut with ⌘, ⌃ or ⌥');
    expect(onSave).not.toHaveBeenCalled();

    // The app's own ⌘K (Command Palette) is fine: the pin works only inside the popup.
    fireEvent.keyDown(pinButton, { key: 'k', metaKey: true });
    await waitFor(() => expect(pinButton).toHaveTextContent('⌘K'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSave).toHaveBeenLastCalledWith({ title: 'HackDesk', quickCapture: { pinShortcut: 'mod+k' } });

    fireEvent.click(screen.getByRole('button', { name: 'Reset shortcut for Pin Quick Hack' }));
    expect(onSave).toHaveBeenLastCalledWith({ title: 'HackDesk', quickCapture: { pinShortcut: 'mod+shift+p' } });
    expect(pinButton).toHaveTextContent('⇧⌘P');

    fireEvent.click(pinButton);
    await waitFor(() => expect(pinButton).toHaveTextContent('Press keys…'));
    fireEvent.keyDown(pinButton, { key: 'Backspace' });
    expect(onSave).toHaveBeenLastCalledWith({ title: 'HackDesk', quickCapture: { pinShortcut: 'none' } });
    expect(pinButton).toHaveTextContent('Disabled');
  });

  it('shows the saved Pin Quick Hack shortcut', () => {
    renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: false,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        quickCapture: { keepOpen: false, pinShortcut: 'mod+alt+k', toggleShortcut: 'control+alt+h' },
        shouldShowHackmdOnboarding: true,
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));

    expect(screen.getByRole('button', { name: 'Set shortcut for Pin Quick Hack' })).toHaveTextContent('⌥⌘K');
    expect(screen.getByRole('button', { name: 'Reset shortcut for Pin Quick Hack' })).toBeEnabled();
  });

  it('shows shortcut conflicts and prevents saving invalid shortcut drafts', async () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));

    const shortcutButton = screen.getByRole('button', { name: 'Set shortcut for Command Palette' });
    fireEvent.click(shortcutButton);
    await waitFor(() => expect(shortcutButton).toHaveTextContent('Press keys…'));
    fireEvent.keyDown(shortcutButton, { key: 'p', metaKey: true });

    expect(await screen.findByRole('alert')).toHaveTextContent('already assigned to Quick Open');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('reports when update checks are unavailable outside packaged Electron', () => {
    renderSettingsDialog({ appVersion: '2.0.0' });

    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));

    expect(toastErrorMock).toHaveBeenCalledWith('Update checks are available only in the packaged Electron app.');
  });

  it('runs the Electron update check and reports status toasts', async () => {
    const checkForUpdates = vi.fn(async () => ({ status: 'upToDate' as const }));
    getHackDeskAPIMock.mockReturnValue({
      app: {
        checkForUpdates,
      },
    });
    renderSettingsDialog({ appVersion: '2.0.0-rc.1' });

    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));

    const checkingButton = screen.getByRole('button', { name: 'Checking…' });
    expect(checkingButton).toBeDisabled();
    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith('HackDesk is up to date.');
    });
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });

  it('opens GitHub Releases instead of checking for updates in beta builds', async () => {
    const checkForUpdates = vi.fn();
    const openExternal = vi.fn(async () => undefined);
    getHackDeskAPIMock.mockReturnValue({
      app: { checkForUpdates },
      shell: { openExternal },
    });
    renderSettingsDialog({ appVersion: '2.0.0-beta.2' });

    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));

    expect(screen.getByText('Unsigned beta · Manual updates')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'View Releases' }));

    await waitFor(() => {
      expect(openExternal).toHaveBeenCalledWith('https://github.com/EastSun5566/hackdesk/releases');
    });
    expect(checkForUpdates).not.toHaveBeenCalled();
  });

  it('reports failures to open GitHub Releases from beta builds', async () => {
    const openExternal = vi.fn(async () => {
      throw new Error('Failed to launch browser.');
    });
    getHackDeskAPIMock.mockReturnValue({
      app: { checkForUpdates: vi.fn() },
      shell: { openExternal },
    });
    renderSettingsDialog({ appVersion: '2.0.0-beta.2' });

    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));
    fireEvent.click(screen.getByRole('button', { name: 'View Releases' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Failed to launch browser.');
    });
  });
});
