import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CODE_THEME_STORAGE_KEY } from '@/lib/code-themes';
import { defaultSettings } from '@/lib/settings';

import {
  previewDraculaTheme,
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

describe('SettingsDialog: search, tabs, resets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHackDeskAPIMock.mockReturnValue(undefined);
    delete window.hackdeskAPI;
    window.localStorage.clear();
  });

  it('finds a field in another section and focuses it', async () => {
    renderSettingsDialog();
    const search = screen.getByLabelText('Search settings');
    fireEvent.change(search, { target: { value: 'editor font' } });
    fireEvent.click(screen.getByLabelText('Editor font, Appearance'));
    const field = screen.getByLabelText('Editor font', { exact: true });
    await waitFor(() => expect(field).toHaveFocus());
    expect(search).toHaveValue('');
  });

  it('preserves title input while navigating settings from search', async () => {
    const { onSave } = renderSettingsDialog();
    const title = screen.getByLabelText('Window title');
    fireEvent.change(title, { target: { value: 'Unsaved title' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Editor' }));
    const search = screen.getByLabelText('Search settings');
    fireEvent.change(search, { target: { value: 'window title' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveValue('Unsaved title');
    // Typing schedules the save, which fires while navigating.
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ title: 'Unsaved title' });
    });
  });

  it('moves the highlighted result with the arrow keys or Ctrl+N and Ctrl+P while focus stays in the search box', async () => {
    renderSettingsDialog();
    const search = screen.getByLabelText('Search settings');
    fireEvent.change(search, { target: { value: 'font' } });
    const options = within(screen.getByRole('listbox', { name: 'Settings search results' })).getAllByRole('option');
    expect(options.length).toBeGreaterThan(2);
    expect(search).toHaveAttribute('role', 'combobox');
    expect(search).toHaveAttribute('aria-activedescendant', options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'n', ctrlKey: true });
    expect(search).toHaveAttribute('aria-activedescendant', options[2].id);
    fireEvent.keyDown(search, { key: 'p', ctrlKey: true });
    expect(search).toHaveAttribute('aria-activedescendant', options[1].id);
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    expect(search).toHaveAttribute('aria-activedescendant', options.at(-1)!.id);

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const label = options[1].getAttribute('aria-label')!.split(', ')[0];
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(screen.getByLabelText(label, { exact: true })).toHaveFocus());
  });

  it('expands a collapsed section to focus a color search result', async () => {
    renderSettingsDialog();
    const search = screen.getByLabelText('Search settings');
    fireEvent.change(search, { target: { value: 'primary' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    const field = screen.getByLabelText('Primary', { exact: true });
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Customize colors' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('finds and focuses a switch by its label', async () => {
    renderSettingsDialog();
    const search = screen.getByLabelText('Search settings');
    fireEvent.change(search, { target: { value: 'outside text editing' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    const field = screen.getByRole('switch', { name: 'Enable ?, / and Space outside text editing' });
    await waitFor(() => expect(field).toHaveFocus());
  });

  it('does not search private input values and clears the query before closing', () => {
    const { onOpenChange, onSave } = renderSettingsDialog();
    fireEvent.change(screen.getByLabelText('Window title'), { target: { value: 'private-query-value' } });
    const search = screen.getByLabelText('Search settings');
    fireEvent.change(search, { target: { value: 'private-query-value' } });
    expect(screen.getByRole('status')).toHaveTextContent('No settings found.');
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('renders a vertical settings tablist and activates tabs with vertical arrow keys', async () => {
    renderSettingsDialog();

    expect(screen.getByRole('tablist', { name: 'Settings sections' })).toHaveAttribute('aria-orientation', 'vertical');

    const generalTab = screen.getByRole('tab', { name: /General/ });
    const editorTab = screen.getByRole('tab', { name: /Editor/ });
    const advancedTab = screen.getByRole('tab', { name: /Advanced/ });

    generalTab.focus();
    fireEvent.keyDown(generalTab, { key: 'ArrowDown' });

    await waitFor(() => {
      expect(editorTab).toHaveFocus();
      expect(editorTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel', { name: 'Editor' })).toBeVisible();
    });

    fireEvent.keyDown(editorTab, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(generalTab).toHaveFocus();
      expect(generalTab).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.keyDown(generalTab, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(advancedTab).toHaveFocus();
      expect(advancedTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel', { name: 'Advanced' })).toBeVisible();
    });
  });

  it('shows a header Reset action on every tab and no save footer', () => {
    renderSettingsDialog();

    expect(screen.queryByText('Window title and local app defaults.')).not.toBeInTheDocument();
    // Every page saves at once; the header only offers to reset the page.
    expect(screen.getByRole('button', { name: 'Reset General settings to defaults' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply Theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel Preview' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    expect(screen.queryByText('Theme mode, presets, fonts, and color seeds.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Appearance settings to defaults' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));
    expect(screen.queryByText('Manage the local Markdown folder.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Local Vault settings to defaults' })).toBeVisible();
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  it('does not submit settings while a save is in flight', () => {
    const { onSave } = renderSettingsDialog({ isSaving: true });

    expect(screen.getByText('Saving…')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Window title'), { target: { value: 'Focus Desk' } });
    fireEvent.submit(screen.getByLabelText('Window title').closest('form')!);

    expect(onSave).not.toHaveBeenCalled();
  });

  it('preserves settings drafts while switching between mounted panels', () => {
    renderSettingsDialog();

    const titleInput = screen.getByLabelText('Window title');
    const tokenInput = screen.getByLabelText('API Token');
    fireEvent.change(titleInput, { target: { value: 'Focus Desk' } });

    fireEvent.click(screen.getByRole('tab', { name: /Editor/ }));
    fireEvent.click(screen.getByText('Helix'));

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(tokenInput, { target: { value: 'draft-token' } });

    fireEvent.click(screen.getByRole('tab', { name: /General/ }));
    expect(titleInput).toBeVisible();
    expect(titleInput).toHaveValue('Focus Desk');

    fireEvent.click(screen.getByRole('tab', { name: /Editor/ }));
    expect(screen.getByRole('radio', { name: /Helix/ })).toBeChecked();

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    expect(tokenInput).toBeVisible();
    expect(tokenInput).toHaveValue('draft-token');
  });

  it('saves a global editor mode from an accessible radio group', () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Editor/ }));

    expect(screen.getByRole('radio', { name: /Standard/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Emacs/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Kakoune \(Experimental\)/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Kakoune (Experimental)'));

    expect(onSave).toHaveBeenCalledWith({
      title: 'HackDesk',
      editor: { mode: 'kakoune' },
    });
  });

  it('confirms before resetting editor mode with all other settings', async () => {
    const { onSave } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: { mode: 'vim' },
        hasHackmdApiToken: false,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });

    window.localStorage.setItem(CODE_THEME_STORAGE_KEY, 'github');
    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset All Settings' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Reset All Settings?' });
    expect(dialog).toBeVisible();
    expect(screen.getByText(/Resets preferences and disconnects HackMD/)).toBeVisible();
    expect(screen.getByText(/Your notes and vault files stay unchanged/i)).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { name: 'Reset All Settings?' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reset All Settings' })).toHaveFocus();
    });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset All Settings' }));
    const confirmDialog = screen.getByRole('alertdialog', { name: 'Reset All Settings?' });
    const confirmButton = within(confirmDialog).getByRole('button', { name: 'Reset All Settings' });
    fireEvent.click(confirmButton);

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      editor: { mode: 'standard' },
    }));
    // The code palette lives on this computer, outside settings, and resets too.
    expect(window.localStorage.getItem(CODE_THEME_STORAGE_KEY)).toBe('theme');
  });

  it('resets the current page from the header after confirming', () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.change(screen.getByLabelText('Window title'), { target: { value: 'Focus Desk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset General settings to defaults' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Reset General settings?' });
    expect(dialog).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog', { name: 'Reset General settings?' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Window title')).toHaveValue('Focus Desk');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset General settings to defaults' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Reset General settings?' }))
      .getByRole('button', { name: 'Reset General' }));

    expect(onSave).toHaveBeenCalledWith({ title: 'HackDesk', appIcon: defaultSettings.appIcon });
    expect(screen.getByLabelText('Window title')).toHaveValue('HackDesk');
  });

  it('resets the appearance page from the header after confirming', async () => {
    renderSettingsDialog();

    await previewDraculaTheme();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Appearance settings to defaults' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Reset Appearance settings?' }))
      .getByRole('button', { name: 'Reset Appearance' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.themePreset).toBe('hackmd-neo');
      expect(screen.getByLabelText('Theme preset')).toHaveTextContent('HackMD Neo');
    });
  });

  it('reverts one editor section without touching the other', () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Editor/ }));
    fireEvent.click(screen.getByText('Helix'));
    expect(onSave).toHaveBeenCalledWith({ title: 'HackDesk', editor: { mode: 'helix' } });

    fireEvent.click(screen.getByRole('button', { name: 'Reset editor mode to standard' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'HackDesk', editor: { mode: 'standard' } });
    expect(screen.getByRole('radio', { name: /Standard/ })).toBeChecked();
  });

  it('reverts one shortcut group without touching other overrides', async () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));
    const shortcutButton = screen.getByRole('button', { name: 'Set shortcut for Command Palette' });
    fireEvent.click(shortcutButton);
    await waitFor(() => expect(shortcutButton).toHaveTextContent('Press keys…'));
    fireEvent.keyDown(shortcutButton, { key: 'e', metaKey: true });
    await waitFor(() => expect(shortcutButton).toHaveTextContent('⌘E'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      shortcuts: { 'open-command-palette': 'mod+e' },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Clear custom navigation shortcuts' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ shortcuts: {} }));
    expect(screen.getByRole('button', { name: 'Set shortcut for Command Palette' })).toHaveTextContent('⌘K');
  });

});
