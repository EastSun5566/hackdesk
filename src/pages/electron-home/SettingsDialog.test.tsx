import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { CODE_THEME_STORAGE_KEY } from '@/lib/code-themes';
import { defaultSettings } from '@/lib/settings';
import { THEME_STORAGE_KEYS } from '@/lib/themes';

import { SettingsDialog } from './SettingsDialog';

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

function renderSettingsDialog(props: Partial<Parameters<typeof SettingsDialog>[0]> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const onChooseLocalVault = props.onChooseLocalVault ?? vi.fn(async () => undefined);
  const onDisconnectHackmd = props.onDisconnectHackmd ?? vi.fn();
  const onForgetLocalVault = props.onForgetLocalVault ?? vi.fn(async () => undefined);
  const onSwitchLocalVault = props.onSwitchLocalVault ?? vi.fn(async () => undefined);
  const onOpenLocalVault = props.onOpenLocalVault ?? vi.fn(async () => undefined);
  const onRefreshLocalVault = props.onRefreshLocalVault ?? vi.fn(async () => undefined);
  const onSave = props.onSave ?? vi.fn();
  const onValidateToken = props.onValidateToken ?? vi.fn();
  const settings = props.settings ?? {
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
  const renderDialog = (nextProps: Partial<Parameters<typeof SettingsDialog>[0]> = {}) => (
    <ThemeProvider defaultTheme="system" storageKey="settings-dialog-test-theme">
      <SettingsDialog
        open
        settings={settings}
        platform="darwin"
        isSaving={false}
        onChooseLocalVault={onChooseLocalVault}
        onDisconnectHackmd={onDisconnectHackmd}
        onForgetLocalVault={onForgetLocalVault}
        onSwitchLocalVault={onSwitchLocalVault}
        onOpenLocalVault={onOpenLocalVault}
        onRefreshLocalVault={onRefreshLocalVault}
        onOpenChange={onOpenChange}
        onSave={onSave}
        onValidateToken={onValidateToken}
        {...props}
        {...nextProps}
      />
    </ThemeProvider>
  );
  const renderResult = render(renderDialog());

  return {
    onChooseLocalVault,
    onDisconnectHackmd,
    onForgetLocalVault,
    onSwitchLocalVault,
    onOpenLocalVault,
    onRefreshLocalVault,
    onOpenChange,
    onSave,
    onValidateToken,
    rerenderSettingsDialog: (nextProps: Partial<Parameters<typeof SettingsDialog>[0]>) => {
      renderResult.rerender(renderDialog(nextProps));
    },
  };
}

async function selectThemeOption(optionName: string | RegExp) {
  const trigger = screen.getByRole('combobox', { name: 'Theme preset' });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

async function previewDraculaTheme() {
  fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
  await selectThemeOption('Dracula');
  await waitFor(() => {
    expect(document.documentElement.dataset.themePreset).toBe('dracula');
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

const validatedUser = {
  email: 'michael@example.com',
  id: 'user-1',
  name: 'Michael',
  photo: null,
  teams: [],
  upgraded: false,
  username: 'michael5566',
};

describe('SettingsDialog', () => {
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

  it('validates a new HackMD token before saving it', async () => {
    const validation = createDeferred<typeof validatedUser>();
    const { onSave, onValidateToken } = renderSettingsDialog({
      onValidateToken: vi.fn(() => validation.promise),
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), {
      target: { value: ' secret-token ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect HackMD' }));

    expect(onValidateToken).toHaveBeenCalledWith('secret-token');
    expect(onSave).not.toHaveBeenCalled();
    const testingButton = screen.getByRole('button', { name: 'Testing…' });
    expect(testingButton).toBeDisabled();
    expect(screen.getByText('Testing token…')).toBeVisible();

    await act(async () => {
      validation.resolve(validatedUser);
    });
    await waitFor(() => {
      expect(screen.getByText('Token works for Michael @michael5566.')).toBeVisible();
      expect(onSave).toHaveBeenCalledWith({
        title: 'HackDesk',
        hackmdApiToken: 'secret-token',
        hackmdAccountLabel: '@michael5566',
      });
    });
  });

  it('shows a HackMD token validation error without saving the token', async () => {
    const { onSave } = renderSettingsDialog({
      onValidateToken: vi.fn(async () => {
        throw new Error('Invalid token');
      }),
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), {
      target: { value: 'bad-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect HackMD' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid token')).toBeVisible();
    });
    expect(screen.getByLabelText('API Token')).toHaveAttribute('aria-invalid', 'true');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('ignores a validation response after the token changes', async () => {
    const validation = createDeferred<typeof validatedUser>();
    const { onSave } = renderSettingsDialog({
      onValidateToken: vi.fn(() => validation.promise),
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    const tokenInput = screen.getByLabelText('API Token');
    fireEvent.change(tokenInput, { target: { value: 'first-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect HackMD' }));
    fireEvent.change(tokenInput, { target: { value: 'second-token' } });

    expect(screen.queryByText('Testing token…')).not.toBeInTheDocument();
    await act(async () => {
      validation.resolve(validatedUser);
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText('Token works for Michael @michael5566.')).not.toBeInTheDocument();
  });

  it('ignores a validation response after the dialog closes', async () => {
    const validation = createDeferred<typeof validatedUser>();
    const { onOpenChange, onSave } = renderSettingsDialog({
      onValidateToken: vi.fn(() => validation.promise),
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'api-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect HackMD' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await act(async () => {
      validation.resolve(validatedUser);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('ignores a validation response after its parent closes Settings', async () => {
    const validation = createDeferred<typeof validatedUser>();
    const { onSave, rerenderSettingsDialog } = renderSettingsDialog({
      onValidateToken: vi.fn(() => validation.promise),
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'api-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect HackMD' }));
    // Another window or command closes Settings without going through the dialog itself.
    rerenderSettingsDialog({ open: false });
    await act(async () => {
      validation.resolve(validatedUser);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('lets a token connect again after Settings closed during a check', async () => {
    const first = createDeferred<typeof validatedUser>();
    const onValidateToken = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async () => validatedUser);
    const { onSave, rerenderSettingsDialog } = renderSettingsDialog({ onValidateToken });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'api-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect HackMD' }));
    expect(screen.getByText('Testing token…')).toBeInTheDocument();

    rerenderSettingsDialog({ open: false });
    rerenderSettingsDialog({ open: true });
    expect(screen.queryByText('Testing token…')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect HackMD' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ hackmdApiToken: 'api-token' }));
    });
    expect(onValidateToken).toHaveBeenCalledTimes(2);
    await act(async () => {
      first.resolve(validatedUser);
    });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('invalidates pending token validation when disconnecting HackMD', async () => {
    const validation = createDeferred<typeof validatedUser>();
    const { onDisconnectHackmd, onSave } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: true,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
      onValidateToken: vi.fn(() => validation.promise),
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'replacement-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect HackMD' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Disconnect HackMD?' }))
      .getByRole('button', { name: 'Disconnect HackMD' }));

    expect(onDisconnectHackmd).toHaveBeenCalledOnce();
    await act(async () => {
      validation.resolve(validatedUser);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not offer a HackMD save when a configured token input is blank', () => {
    renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: true,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));

    expect(screen.getByRole('button', { name: 'Save new token' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Test Token' })).not.toBeInTheDocument();
  });

  it('shows a credential storage error while retaining the option to disconnect', () => {
    renderSettingsDialog({
      settings: {
        title: 'HackDesk', appearance: defaultSettings.appearance, editor: defaultSettings.editor,
        workspaceNavigation: defaultSettings.workspaceNavigation,
        hasHackmdApiToken: true, hackmdTokenStorageError: 'Unlock your system keyring or reconnect.',
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: true, localVault: { vaults: [{ id: 'vault-tmp', path: '/tmp/vault' }], activeVaultId: 'vault-tmp', workspaces: [], activeWorkspaceId: null }, onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unlock your system keyring or reconnect.');
    expect(screen.getByRole('button', { name: 'Disconnect HackMD' })).toBeEnabled();
  });

  it('confirms before disconnecting HackMD and restores focus on cancel', async () => {
    const { onDisconnectHackmd } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: true,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    const disconnectButton = screen.getByRole('button', { name: 'Disconnect HackMD' });
    fireEvent.click(disconnectButton);

    const dialog = screen.getByRole('alertdialog', { name: 'Disconnect HackMD?' });
    expect(dialog).toBeVisible();
    expect(screen.getByText(/Removes the saved token/i)).toBeVisible();
    expect(onDisconnectHackmd).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { name: 'Disconnect HackMD?' })).not.toBeInTheDocument();
      expect(disconnectButton).toHaveFocus();
    });
    expect(onDisconnectHackmd).not.toHaveBeenCalled();

    fireEvent.click(disconnectButton);
    const escapeDialog = screen.getByRole('alertdialog', { name: 'Disconnect HackMD?' });
    fireEvent.keyDown(escapeDialog, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { name: 'Disconnect HackMD?' })).not.toBeInTheDocument();
      expect(disconnectButton).toHaveFocus();
    });
    expect(onDisconnectHackmd).not.toHaveBeenCalled();

    fireEvent.click(disconnectButton);
    const confirmDialog = screen.getByRole('alertdialog', { name: 'Disconnect HackMD?' });
    const confirmButton = within(confirmDialog).getByRole('button', { name: 'Disconnect HackMD' });
    fireEvent.click(confirmButton);

    expect(onDisconnectHackmd).toHaveBeenCalledOnce();
  });

  it('lists connected accounts with switch and forget actions', () => {
    const { onSave } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: true,
        hackmdAccounts: {
          accounts: [
            { id: 'a1', label: '@ada', hasToken: true },
            { id: 'g1', label: '@grace', hasToken: true },
          ],
          activeAccountId: 'a1',
        },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    expect(screen.getByText('@ada')).toBeVisible();
    expect(screen.getByText('@grace')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'HackDesk', hackmdActiveAccountId: 'g1' });

    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Forget @grace?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Forget Account' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'HackDesk', hackmdRemoveAccountId: 'g1' });
  });

  it('connects another account from the token form without replacing the active one', async () => {
    const { onSave } = renderSettingsDialog({
      onValidateToken: vi.fn(async () => validatedUser),
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: true,
        hackmdAccounts: {
          accounts: [{ id: 'a1', label: '@ada', hasToken: true }],
          activeAccountId: 'a1',
        },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect another account' }));
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'second-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        title: 'HackDesk',
        hackmdApiToken: 'second-token',
        hackmdAccountLabel: '@michael5566',
        hackmdAddAccount: true,
      });
    });
  });

  it('does not show Disconnect HackMD without a configured token', () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));

    expect(screen.queryByRole('button', { name: 'Disconnect HackMD' })).not.toBeInTheDocument();
  });

  it('shows local vault details and runs vault actions', async () => {
    const {
      onChooseLocalVault,
      onForgetLocalVault,
      onOpenLocalVault,
      onRefreshLocalVault,
      onSwitchLocalVault,
    } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: false,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: true,
        localVault: { vaults: [{ id: 'vault-notes', path: '/Users/michael/MyVault' }], activeVaultId: 'vault-notes', workspaces: [], activeWorkspaceId: null },
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
      localVaultSnapshot: {
        vaultId: 'vault-1',
        rootPath: '/Users/michael/Notes',
        scannedAtMillis: 1_700_000_000_000,
        folders: [{ id: 'local-folder:Projects', name: 'Projects', relativePath: 'Projects', parentPath: null, createdAtMillis: 1, updatedAtMillis: 1 }],
        notes: [
          { id: 'note-1', title: 'Plan', relativePath: 'Projects/Plan.md', parentPath: 'Projects', createdAtMillis: 1, updatedAtMillis: 1, revision: { contentHash: 'hash', mtimeMs: 1 } },
          { id: 'note-2', title: 'Daily', relativePath: 'Daily.md', parentPath: null, createdAtMillis: 1, updatedAtMillis: 1, revision: { contentHash: 'hash-2', mtimeMs: 2 } },
        ],
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));

    expect(screen.getAllByText('/Users/michael/MyVault').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('MyVault').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Folders').length).toBeGreaterThanOrEqual(1);
    // The open folder is marked in the one folder list, with its note count; no separate card.
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('· 2 notes')).toBeInTheDocument();
    expect(screen.queryByText('Currently open')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in Finder' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh Vault' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add Folder' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Forget' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Open in Finder' }));
    await waitFor(() => expect(onOpenLocalVault).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Vault' }));
    await waitFor(() => expect(onRefreshLocalVault).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Add Folder' }));
    await waitFor(() => expect(onChooseLocalVault).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    await waitFor(() => expect(onForgetLocalVault).toHaveBeenCalledWith('vault-notes'));

    expect(onOpenLocalVault).toHaveBeenCalledOnce();
    expect(onRefreshLocalVault).toHaveBeenCalledOnce();
    expect(onChooseLocalVault).toHaveBeenCalledOnce();
    expect(onForgetLocalVault).toHaveBeenCalledWith('vault-notes');
    expect(onSwitchLocalVault).not.toHaveBeenCalled();
  });

  it('creates, edits, opens and deletes named workspaces', async () => {
    const localWorkspaceActions = {
      create: vi.fn(async () => undefined),
      rename: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      activate: vi.fn(async () => undefined),
      setVaults: vi.fn(async () => undefined),
    };
    renderSettingsDialog({
      localWorkspaceActions,
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: false,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: true,
        localVault: {
          vaults: [{ id: 'vault-a', path: '/Users/michael/A' }, { id: 'vault-b', path: '/Users/michael/B' }],
          activeVaultId: 'vault-a',
          workspaces: [{ id: 'workspace-work', name: 'Work', vaultIds: ['vault-a'] }],
          activeWorkspaceId: 'workspace-work',
        },
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));

    const workspaceRow = () => screen.getByRole('button', { name: 'Edit workspace Work' }).closest('li') as HTMLElement;
    expect(within(workspaceRow()).getByText('Work')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close workspace Work' }));
    await waitFor(() => expect(localWorkspaceActions.activate).toHaveBeenCalledWith(null));

    fireEvent.click(screen.getByRole('button', { name: 'Edit workspace Work' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Studio' } });
    fireEvent.click(within(workspaceRow()).getByLabelText('B'));
    fireEvent.click(screen.getByRole('button', { name: 'Save workspace Work' }));
    await waitFor(() => expect(localWorkspaceActions.rename).toHaveBeenCalledWith('workspace-work', 'Studio'));
    await waitFor(() => expect(localWorkspaceActions.setVaults).toHaveBeenCalledWith('workspace-work', ['vault-a', 'vault-b']));

    fireEvent.click(screen.getByRole('button', { name: 'Delete workspace Work' }));
    await waitFor(() => expect(localWorkspaceActions.remove).toHaveBeenCalledWith('workspace-work'));

    // The create form stays folded away until asked for.
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }));
    const newForm = screen.getByRole('group', { name: 'Create a workspace' });
    fireEvent.change(within(newForm).getByLabelText('Workspace name'), { target: { value: 'Reading' } });
    fireEvent.click(within(newForm).getByLabelText('A'));
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(localWorkspaceActions.create).toHaveBeenCalledWith('Reading', ['vault-a']));
  });

  it('switches between vaults from the folders list', () => {
    const { onSwitchLocalVault } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        workspaceNavigation: defaultSettings.workspaceNavigation,
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: false,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: true,
        localVault: { vaults: [{ id: 'vault-a', path: '/Users/michael/A' }, { id: 'vault-b', path: '/Users/michael/B' }], activeVaultId: 'vault-a', workspaces: [], activeWorkspaceId: null },
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));

    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('B').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    expect(onSwitchLocalVault).toHaveBeenCalledWith('vault-b');
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
      accelerator: 'Control+Alt+H' as const,
      registered: true,
    }));
    window.hackdeskAPI = {
      app: { getQuickCaptureShortcutStatus },
      platform: 'darwin',
    } as unknown as typeof window.hackdeskAPI;

    renderSettingsDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));

    const row = screen.getByText('Quick Hack').closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('⌃⌥H')).toBeVisible();
    expect(within(row as HTMLElement).getByText('Checking…')).toBeVisible();

    await waitFor(() => expect(within(row as HTMLElement).getByText('Global')).toBeVisible());
  });

  it('shows unavailable when the quick capture global shortcut is not registered', async () => {
    window.hackdeskAPI = {
      app: {
        getQuickCaptureShortcutStatus: vi.fn(async () => ({
          accelerator: 'Control+Alt+H' as const,
          registered: false,
        })),
      },
      platform: 'darwin',
    } as unknown as typeof window.hackdeskAPI;

    renderSettingsDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));

    const row = screen.getByText('Quick Hack').closest('li');
    expect(row).not.toBeNull();
    await waitFor(() => expect(within(row as HTMLElement).getByText('Unavailable')).toBeVisible());
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
