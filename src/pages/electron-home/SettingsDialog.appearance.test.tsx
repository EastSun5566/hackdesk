import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSettings } from '@/lib/settings';
import { THEME_STORAGE_KEYS } from '@/lib/themes';

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

describe('SettingsDialog: appearance, title, app icon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHackDeskAPIMock.mockReturnValue(undefined);
    delete window.hackdeskAPI;
    window.localStorage.clear();
  });

  it('applies appearance changes at once without closing the dialog', async () => {
    const { onOpenChange } = renderSettingsDialog();

    await previewDraculaTheme();

    expect(localStorage.getItem(THEME_STORAGE_KEYS.presetId)).toBe('dracula');
    // Applying shows in the app itself; no toast, and settings stays open.
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('never applies an invalid seed, and closing clears it', async () => {
    const { onOpenChange } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    const trigger = screen.getByRole('button', { name: 'Customize colors' });
    fireEvent.click(trigger);
    const primaryInput = screen.getByLabelText('Primary');
    fireEvent.change(primaryInput, { target: { value: 'blue' } });

    expect(screen.getByText('Use a 6-digit hex color, for example #5D54E8.')).toBeInTheDocument();
    expect(localStorage.getItem(THEME_STORAGE_KEYS.presetId)).not.toBe('dracula');
    expect(document.documentElement.dataset.themePreset).toBe('hackmd-neo');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Reopening starts from the saved appearance, not the abandoned input.
    expect(screen.getByLabelText('Primary')).toHaveValue('');
  });

  it('keeps the applied appearance when the parent closes settings', async () => {
    // Appearance applies at once, so closing through the parent's open prop keeps the theme.
    const { rerenderSettingsDialog } = renderSettingsDialog();

    await previewDraculaTheme();
    rerenderSettingsDialog({ open: false });

    await waitFor(() => {
      expect(document.documentElement.dataset.themePreset).toBe('dracula');
    });
    expect(localStorage.getItem(THEME_STORAGE_KEYS.presetId)).toBe('dracula');

    // Reopening starts from the saved appearance.
    rerenderSettingsDialog({ open: true });
    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    expect(screen.getByLabelText('Theme preset')).toHaveTextContent('Dracula');
  });

  it('keeps the applied appearance when settings remounts', async () => {
    const { rerenderSettingsDialog } = renderSettingsDialog();

    await previewDraculaTheme();
    rerenderSettingsDialog({ initialTab: 'editor' });

    await waitFor(() => {
      expect(document.documentElement.dataset.themePreset).toBe('dracula');
    });
  });

  it('keeps custom seed inputs mounted while collapsed and validates them live', async () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));

    const trigger = screen.getByRole('button', { name: 'Customize colors' });
    const primaryInput = screen.getByLabelText('Primary');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(primaryInput).not.toBeVisible();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(primaryInput).toBeVisible();
    fireEvent.change(primaryInput, {
      target: { value: 'blue' },
    });

    expect(screen.getByText('Use a 6-digit hex color, for example #5D54E8.')).toBeInTheDocument();
    // Invalid input never applies: the theme stays on the saved preset.
    await waitFor(() => {
      expect(document.documentElement.dataset.themePreset).toBe('hackmd-neo');
    });

    fireEvent.change(primaryInput, { target: { value: '#5D54E8' } });
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEYS.customSeed) ?? '{}')).toMatchObject({
        primary: '#5D54E8',
      });
    });

    fireEvent.click(trigger);
    expect(primaryInput).not.toBeVisible();
    expect(primaryInput).toHaveValue('#5D54E8');

    fireEvent.click(screen.getByRole('tab', { name: /General/ }));
    expect(primaryInput).not.toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    expect(primaryInput).not.toBeVisible();

    fireEvent.click(trigger);
    expect(primaryInput).toBeVisible();
    expect(primaryInput).toHaveValue('#5D54E8');
  });

  it('applies UI and editor font sizes at once', async () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    const uiFontSize = screen.getByLabelText('UI font size');
    const editorFontSize = screen.getByLabelText('Editor font size');
    await waitFor(() => {
      expect(document.getElementById('hackdesk-theme')?.textContent).toContain('--font-size-ui: 0.875rem');
    });
    fireEvent.change(uiFontSize, { target: { value: '16' } });
    fireEvent.change(editorFontSize, { target: { value: '20' } });

    await waitFor(() => {
      expect(uiFontSize).toHaveValue(16);
      expect(editorFontSize).toHaveValue(20);
      expect(document.getElementById('hackdesk-theme')?.textContent).toContain('--font-size-ui: 1rem');
      expect(document.getElementById('hackdesk-theme')?.textContent).toContain('--font-size-editor: 1.25rem');
    });

    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEYS.typography) ?? '{}')).toMatchObject({
      uiFontSize: 16,
      editorFontSize: 20,
    });
  });

  it('rejects empty, fractional, and out-of-range font sizes without applying them', async () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    const uiFontSize = screen.getByLabelText('UI font size');
    const editorFontSize = screen.getByLabelText('Editor font size');

    fireEvent.change(uiFontSize, { target: { value: '' } });
    expect(screen.getByText('Enter a whole number from 12 to 18.')).toBeVisible();

    fireEvent.change(uiFontSize, { target: { value: '14.5' } });
    expect(screen.getByText('Enter a whole number from 12 to 18.')).toBeVisible();

    fireEvent.change(uiFontSize, { target: { value: '16' } });
    fireEvent.change(editorFontSize, { target: { value: '33' } });
    expect(screen.getByText('Enter a whole number from 10 to 32.')).toBeVisible();

    // The valid size applied on its own; the invalid one never does.
    await waitFor(() => {
      expect(document.getElementById('hackdesk-theme')?.textContent).toContain('--font-size-ui: 1rem');
      expect(document.getElementById('hackdesk-theme')?.textContent).toContain('--font-size-editor: 0.9375rem');
    });

    fireEvent.change(editorFontSize, { target: { value: '20' } });
    await waitFor(() => {
      expect(document.getElementById('hackdesk-theme')?.textContent).toContain('--font-size-ui: 1rem');
      expect(document.getElementById('hackdesk-theme')?.textContent).toContain('--font-size-editor: 1.25rem');
    });
  });

  it('saves the title when committed and after a pause', async () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.change(screen.getByLabelText('Window title'), {
      target: { value: 'Focus Desk' },
    });
    // Enter commits the field at once.
    fireEvent.submit(screen.getByLabelText('Window title').closest('form')!);
    expect(onSave).toHaveBeenCalledWith({ title: 'Focus Desk' });

    fireEvent.change(screen.getByLabelText('Window title'), {
      target: { value: 'Paused Desk' },
    });
    // Typing alone saves once it pauses.
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ title: 'Paused Desk' });
    });
  });

  it('never saves an empty title and restores the saved one on blur', () => {
    const { onSave } = renderSettingsDialog();

    const title = screen.getByLabelText('Window title');
    fireEvent.change(title, { target: { value: '' } });
    expect(screen.getByText(/an empty title never saves/i)).toBeVisible();
    fireEvent.submit(title.closest('form')!);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.blur(title);
    expect(title).toHaveValue('HackDesk');
  });

  it('keeps its page, search and focus when its own saves change the settings', () => {
    const settings = {
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
      shouldShowHackmdOnboarding: true,
    };
    const { rerenderSettingsDialog } = renderSettingsDialog({ settings });

    fireEvent.click(screen.getByRole('tab', { name: 'Editor' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Vim' }));
    // The saved mode comes back as new settings while Settings is still open.
    rerenderSettingsDialog({ settings: { ...settings, editor: { ...settings.editor, mode: 'vim' } } });
    expect(screen.getByRole('tab', { name: 'Editor' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radio', { name: 'Vim' })).toBeChecked();

    const search = screen.getByRole('combobox', { name: 'Search settings' });
    fireEvent.change(search, { target: { value: 'editor font' } });
    search.focus();
    const savedTitle = { ...settings, title: 'Saved Desk', editor: { ...settings.editor, mode: 'vim' as const } };
    rerenderSettingsDialog({ settings: savedTitle });
    expect(screen.getByRole('combobox', { name: 'Search settings' })).toHaveValue('editor font');
    expect(screen.getByRole('combobox', { name: 'Search settings' })).toHaveFocus();

    // Asking for a page still opens it.
    rerenderSettingsDialog({ settings: savedTitle, initialTab: 'shortcuts' });
    expect(screen.getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('aria-selected', 'true');
  });

  it('commits the title with Enter only on the page that has it', () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }));
    fireEvent.submit(screen.getByRole('tab', { name: 'Shortcuts' }).closest('form')!);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a title still waiting for its debounce when the field loses focus', () => {
    const { onSave } = renderSettingsDialog();

    const title = screen.getByLabelText('Window title');
    fireEvent.change(title, { target: { value: ' Quick Desk ' } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.blur(title);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ title: 'Quick Desk' });
  });

  it('saves a title still waiting for its debounce when Settings closes', () => {
    const { onOpenChange, onSave } = renderSettingsDialog();

    fireEvent.change(screen.getByLabelText('Window title'), { target: { value: 'Closing Desk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).toHaveBeenCalledWith({ title: 'Closing Desk' });
  });

  it('does not save a typed title over a revert that followed it', async () => {
    const { onSave } = renderSettingsDialog({
      settings: {
        title: 'Custom Desk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: false,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: true,
      },
    });

    const title = screen.getByLabelText('Window title');
    fireEvent.change(title, { target: { value: 'Typed Desk' } });
    fireEvent.click(screen.getByRole('button', { name: `Reset window title to ${defaultSettings.title}` }));
    fireEvent.blur(title);
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(onSave).toHaveBeenCalledWith({ title: defaultSettings.title });
    expect(onSave).not.toHaveBeenCalledWith({ title: 'Typed Desk' });
  });

  it('saves and applies a chosen app icon at once', () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('radio', { name: 'Nightly' }));

    expect(onSave).toHaveBeenCalledWith({ title: 'HackDesk', appIcon: 'nightly' });
  });

  it('resets the app icon with its section and with the General page', () => {
    const settings = {
      title: 'HackDesk',
      workspaceNavigation: defaultSettings.workspaceNavigation,
      appearance: defaultSettings.appearance,
      editor: defaultSettings.editor,
      appIcon: 'neon' as const,
      hasHackmdApiToken: false,
      hackmdAccounts: { accounts: [], activeAccountId: null },
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      hasLocalVault: false,
      localVault: defaultSettings.localVault,
      onboarding: defaultSettings.onboarding,
      shouldShowHackmdOnboarding: true,
    };
    const { onSave } = renderSettingsDialog({ settings });

    fireEvent.click(screen.getByRole('button', { name: 'Reset app icon to Match Appearance' }));
    expect(onSave).toHaveBeenLastCalledWith({ title: 'HackDesk', appIcon: defaultSettings.appIcon });
    expect(screen.getByRole('radio', { name: 'Match Appearance' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Neon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset General settings to defaults' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Reset General settings?' }))
      .getByRole('button', { name: 'Reset General' }));
    expect(onSave).toHaveBeenLastCalledWith({ title: 'HackDesk', appIcon: defaultSettings.appIcon });
    expect(screen.getByRole('radio', { name: 'Match Appearance' })).toBeChecked();
  });

  it('reveals secret app icons after repeatedly clicking the selected icon', () => {
    const { onSave } = renderSettingsDialog();

    expect(screen.queryByRole('radio', { name: 'Building Blocks' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Pancake' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Mooncake' })).not.toBeInTheDocument();
    const selected = screen.getByRole('radio', { name: 'Match Appearance' });
    for (let click = 0; click < 5; click += 1) {
      fireEvent.click(selected);
    }

    expect(screen.getByRole('radio', { name: 'Building Blocks' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pancake' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Mooncake' })).toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith('Secret icons unlocked.');
    // Clicking the icon that is already selected changes nothing, so nothing saves.
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows secret app icons when one is already selected', () => {
    renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        appIcon: 'blocks',
        hasHackmdApiToken: false,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: true,
      },
    });

    expect(screen.getByRole('radio', { name: 'Building Blocks' })).toBeChecked();
  });

});
