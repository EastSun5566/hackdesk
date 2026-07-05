import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
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
  const onOpenLocalVault = props.onOpenLocalVault ?? vi.fn(async () => undefined);
  const onRefreshLocalVault = props.onRefreshLocalVault ?? vi.fn(async () => undefined);
  const onSave = props.onSave ?? vi.fn();
  const onValidateToken = props.onValidateToken ?? vi.fn();
  const settings = props.settings ?? {
    title: 'HackDesk',
    appearance: defaultSettings.appearance,
    editor: defaultSettings.editor,
    hasHackmdApiToken: false,
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
    window.localStorage.clear();
  });

  it('keeps the dialog body scrollable when settings content is taller than the viewport', () => {
    renderSettingsDialog();

    const tabpanel = screen.getByRole('tabpanel', { name: 'General' });

    expect(tabpanel).toHaveClass('overflow-y-auto');
    expect(tabpanel).toHaveClass('overscroll-contain');
    expect(tabpanel.className).toContain('[scrollbar-gutter:stable]');
  });

  it('links every tab to a mounted panel and hides inactive panels', () => {
    renderSettingsDialog();

    const tabs = screen.getAllByRole('tab');
    const panels = screen.getAllByRole('tabpanel', { hidden: true });

    expect(tabs).toHaveLength(7);
    expect(panels).toHaveLength(7);

    tabs.forEach((tab) => {
      expect(tab.tagName).toBe('BUTTON');
      expect(tab).toHaveAttribute('type', 'button');

      const panelId = tab.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();

      const panel = document.getElementById(panelId!);
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);

      if (tab.getAttribute('aria-selected') === 'true') {
        expect(panel).toBeVisible();
        expect(panel).not.toHaveAttribute('inert');
      } else {
        expect(panel).not.toBeVisible();
        expect(panel).toHaveAttribute('hidden');
        expect(panel).toHaveAttribute('inert');
      }
    });
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

  it('shows one settings section per tab instead of one long form', () => {
    renderSettingsDialog();

    expect(screen.getByRole('tab', { name: /General/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Window title')).toBeVisible();
    expect(screen.getByLabelText('API Token')).not.toBeVisible();
    expect(screen.queryByText('Apply Theme')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));
    expect(screen.getByText('No local vault configured')).toBeVisible();
    expect(screen.getByLabelText('Window title')).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    expect(screen.getByLabelText('API Token')).toBeVisible();
    expect(screen.getByLabelText('Window title')).not.toBeVisible();
  });

  it('updates footer actions with the active tab without repeating tab descriptions', () => {
    renderSettingsDialog();

    expect(screen.queryByText('Window title and local app defaults.')).not.toBeInTheDocument();
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeVisible();
    expect(saveButton).toHaveTextContent('Save');
    expect(saveButton).not.toHaveAttribute('title');
    expect(screen.queryByText('Save settings')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    expect(screen.queryByText('Theme mode, presets, fonts, and color seeds.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply Theme' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));
    expect(screen.queryByText('Manage the local Markdown folder.')).not.toBeInTheDocument();
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    expect(closeButtons.length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Apply Theme' })).toBeNull();
  });

  it('does not submit settings while the save action is busy', () => {
    const { onSave } = renderSettingsDialog({ isSaving: true });
    const saveButton = screen.getByRole('button', { name: 'Saving…' });

    expect(saveButton).toBeDisabled();
    expect(saveButton.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
    fireEvent.click(saveButton);
    fireEvent.submit(saveButton.closest('form')!);

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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({
      title: 'HackDesk',
      editor: { mode: 'kakoune' },
    });
  });

  it('confirms before resetting editor mode with all other settings', async () => {
    const { onSave } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        appearance: defaultSettings.appearance,
        editor: { mode: 'vim' },
        hasHackmdApiToken: false,
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset All Settings' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Reset All Settings?' });
    expect(dialog).toBeVisible();
    expect(screen.getByText(/restores local preferences, editor mode, appearance/i)).toBeVisible();
    expect(screen.getByText(/Local vault Markdown files are not deleted/i)).toBeVisible();
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
    expect(confirmButton).toHaveClass('bg-destructive-default');
    expect(confirmButton).toHaveClass('text-destructive-foreground');
    fireEvent.click(confirmButton);

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      editor: { mode: 'standard' },
    }));
  });

  it('applies the current appearance draft and closes the dialog', async () => {
    const { onOpenChange } = renderSettingsDialog();

    await previewDraculaTheme();
    fireEvent.click(screen.getByRole('button', { name: 'Apply Theme' }));

    expect(localStorage.getItem(THEME_STORAGE_KEYS.presetId)).toBe('dracula');
    expect(toastSuccessMock).toHaveBeenCalledWith('Theme applied');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps custom seed inputs mounted while collapsed and preserves validation state', () => {
    const { onOpenChange } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));

    const trigger = screen.getByRole('button', { name: 'Customize Colors' });
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
    expect(screen.getByRole('button', { name: 'Apply Theme' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply Theme' }));
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    expect(primaryInput).not.toBeVisible();
    expect(primaryInput).toHaveValue('blue');

    fireEvent.click(screen.getByRole('tab', { name: /General/ }));
    expect(primaryInput).not.toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    expect(primaryInput).not.toBeVisible();

    fireEvent.click(trigger);
    expect(primaryInput).toBeVisible();
    expect(primaryInput).toHaveValue('blue');
    expect(screen.getByText('Use a 6-digit hex color, for example #5D54E8.')).toBeVisible();
  });

  it('cancels an appearance preview from the footer without closing settings', async () => {
    const { onOpenChange } = renderSettingsDialog();

    await previewDraculaTheme();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Preview' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.themePreset).toBe('hackmd-neo');
      expect(screen.getByLabelText('Theme preset')).toHaveTextContent('HackMD Neo');
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('cancels an appearance preview when the dialog close button is used', async () => {
    const { onOpenChange, rerenderSettingsDialog } = renderSettingsDialog();

    await previewDraculaTheme();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.themePreset).toBe('hackmd-neo');
      expect(screen.getByLabelText('Theme preset')).toHaveTextContent('HackMD Neo');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerenderSettingsDialog({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    rerenderSettingsDialog({ open: true });

    await waitFor(() => {
      expect(screen.getByLabelText('Theme preset')).toHaveTextContent('HackMD Neo');
    });
  });

  it('cancels an appearance preview when Escape closes the dialog', async () => {
    const { onOpenChange } = renderSettingsDialog();

    await previewDraculaTheme();
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(document.documentElement.dataset.themePreset).toBe('hackmd-neo');
      expect(screen.getByLabelText('Theme preset')).toHaveTextContent('HackMD Neo');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('cancels an appearance preview from another tab footer before closing', async () => {
    const { onOpenChange } = renderSettingsDialog();

    await previewDraculaTheme();
    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));
    const footerCloseButton = screen.getAllByRole('button', { name: 'Close' })
      .find((button) => button.textContent?.trim() === 'Close');

    expect(footerCloseButton).toBeDefined();
    fireEvent.click(footerCloseButton as HTMLButtonElement);

    await waitFor(() => {
      expect(document.documentElement.dataset.themePreset).toBe('hackmd-neo');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows Electron appearance typography controls and mainstream presets', async () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));

    expect(screen.getByText('Typography')).toBeVisible();
    const helpButton = screen.getByRole('button', { name: 'About Appearance' });
    expect(helpButton).toBeVisible();
    expect(helpButton).toHaveClass('relative');
    expect(helpButton.className).toContain('after:-inset-2');
    helpButton.focus();
    expect(helpButton).toHaveFocus();
    expect(await screen.findByText('Theme changes preview immediately. Apply Theme keeps the preview; Cancel Preview restores the saved theme.')).toBeVisible();
    expect(screen.queryByText('Choose local font stacks for HackDesk chrome and the markdown editor.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Theme preset')).toHaveTextContent('HackMD Neo');
    expect(screen.getByLabelText('Theme preset')).not.toHaveTextContent('hackmd-neo');
    expect(screen.getByText('The default HackDesk writing palette.')).toBeVisible();
    expect(screen.getByLabelText('UI font')).toBeVisible();
    expect(screen.getByLabelText('Editor font')).toBeVisible();
    const uiFontSize = screen.getByLabelText('UI font size');
    expect(uiFontSize).toHaveAttribute('type', 'number');
    expect(uiFontSize).toHaveAttribute('min', '12');
    expect(uiFontSize).toHaveAttribute('max', '18');
    expect(uiFontSize).toHaveAttribute('step', '1');
    expect(uiFontSize).toHaveValue(14);
    const editorFontSize = screen.getByLabelText('Editor font size');
    expect(editorFontSize).toHaveAttribute('type', 'number');
    expect(editorFontSize).toHaveAttribute('min', '10');
    expect(editorFontSize).toHaveAttribute('max', '32');
    expect(editorFontSize).toHaveAttribute('step', '1');
    expect(editorFontSize).toHaveValue(14);
  });

  it('previews, applies, and persists UI and editor font sizes independently', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Apply Theme' }));

    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEYS.typography) ?? '{}')).toMatchObject({
      uiFontSize: 16,
      editorFontSize: 20,
    });
  });

  it('rejects empty, fractional, and out-of-range font sizes and restores them on cancel', async () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    const uiFontSize = screen.getByLabelText('UI font size');
    const editorFontSize = screen.getByLabelText('Editor font size');

    fireEvent.change(uiFontSize, { target: { value: '' } });
    expect(screen.getByText('Enter a whole number from 12 to 18.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Apply Theme' })).toBeDisabled();

    fireEvent.change(uiFontSize, { target: { value: '14.5' } });
    expect(screen.getByText('Enter a whole number from 12 to 18.')).toBeVisible();

    fireEvent.change(uiFontSize, { target: { value: '16' } });
    fireEvent.change(editorFontSize, { target: { value: '33' } });
    expect(screen.getByText('Enter a whole number from 10 to 32.')).toBeVisible();

    fireEvent.change(editorFontSize, { target: { value: '20' } });
    expect(screen.getByRole('button', { name: 'Apply Theme' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Preview' }));

    expect(uiFontSize).toHaveValue(14);
    expect(editorFontSize).toHaveValue(14);
    await waitFor(() => {
      expect(document.getElementById('hackdesk-theme')?.textContent).toContain('--font-size-ui: 0.875rem');
      expect(document.getElementById('hackdesk-theme')?.textContent).toContain('--font-size-editor: 0.875rem');
    });
  });

  it('updates the theme select label and description when choosing another preset', async () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    await selectThemeOption('Dracula');

    expect(screen.getByLabelText('Theme preset')).toHaveTextContent('Dracula');
    expect(screen.getByText('Dracula dark palette; light mode keeps HackMD Neo surfaces with Dracula accents.')).toBeVisible();

    await selectThemeOption('Gruvbox');
    expect(screen.getByLabelText('Theme preset')).toHaveTextContent('Gruvbox');
    expect(screen.getByText('Gruvbox Light and Dark for warm terminal-style writing.')).toBeVisible();
  });

  it('saves the title from its tab-specific footer action', () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.change(screen.getByLabelText('Window title'), {
      target: { value: 'Focus Desk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({ title: 'Focus Desk' });
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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onValidateToken).toHaveBeenCalledWith('secret-token');
    expect(onSave).not.toHaveBeenCalled();
    const testingButton = screen.getByRole('button', { name: 'Testing…' });
    expect(testingButton).toBeDisabled();
    expect(testingButton.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
    expect(screen.getByText('Testing token…')).toBeVisible();

    await act(async () => {
      validation.resolve(validatedUser);
    });
    await waitFor(() => {
      expect(screen.getByText('Token works for Michael @michael5566.')).toBeVisible();
      expect(onSave).toHaveBeenCalledWith({
        title: 'HackDesk',
        hackmdApiToken: 'secret-token',
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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await act(async () => {
      validation.resolve(validatedUser);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('invalidates pending token validation when disconnecting HackMD', async () => {
    const validation = createDeferred<typeof validatedUser>();
    const { onDisconnectHackmd, onSave } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: true,
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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
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
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: true,
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Test Token' })).not.toBeInTheDocument();
  });

  it('confirms before disconnecting HackMD and restores focus on cancel', async () => {
    const { onDisconnectHackmd } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: true,
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
    expect(screen.getByText(/API token stored by HackDesk/i)).toBeVisible();
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
    expect(confirmButton).toHaveClass('bg-destructive-default');
    expect(confirmButton).toHaveClass('text-destructive-foreground');
    fireEvent.click(confirmButton);

    expect(onDisconnectHackmd).toHaveBeenCalledOnce();
  });

  it('does not show Disconnect HackMD without a configured token', () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));

    expect(screen.queryByRole('button', { name: 'Disconnect HackMD' })).not.toBeInTheDocument();
  });

  it('shows local vault details and runs vault actions', () => {
    const {
      onChooseLocalVault,
      onForgetLocalVault,
      onOpenLocalVault,
      onRefreshLocalVault,
    } = renderSettingsDialog({
      settings: {
        title: 'HackDesk',
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: false,
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: true,
        localVault: { path: '/Users/michael/Notes' },
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

    expect(screen.getByText('/Users/michael/Notes')).toBeInTheDocument();
    expect(screen.getByText('These actions change HackDesk settings only. Markdown files are not deleted.')).toBeVisible();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Folders')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in Finder' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh Vault' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Change Vault' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Forget Vault' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Open in Finder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Vault' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change Vault' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget Vault' }));

    expect(onOpenLocalVault).toHaveBeenCalledOnce();
    expect(onRefreshLocalVault).toHaveBeenCalledOnce();
    expect(onChooseLocalVault).toHaveBeenCalledOnce();
    expect(onForgetLocalVault).toHaveBeenCalledOnce();
  });

  it('uses a reduced-motion-safe spinner while vault actions are busy', () => {
    const refreshVault = createDeferred<void>();
    renderSettingsDialog({
      onRefreshLocalVault: vi.fn(() => refreshVault.promise),
      settings: {
        title: 'HackDesk',
        appearance: defaultSettings.appearance,
        editor: defaultSettings.editor,
        hasHackmdApiToken: false,
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasLocalVault: true,
        localVault: { path: '/Users/michael/Notes' },
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Vault' }));

    const refreshButton = screen.getByRole('button', { name: 'Refresh Vault' });
    expect(refreshButton).toBeDisabled();
    expect(refreshButton.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
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
    fireEvent.keyDown(shortcutButton, { key: 'j', metaKey: true });

    await waitFor(() => expect(shortcutButton).toHaveTextContent('⌘J'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({
      title: 'HackDesk',
      shortcuts: {
        'open-command-palette': 'mod+j',
      },
    });
  });

  it('shows removed default shortcuts as unassigned', () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));
    fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'workspace' } });

    const row = screen.getByText('Focus Workspace').closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole('button', { name: 'Set shortcut for Focus Workspace' })).toHaveTextContent('Unassigned');
  });

  it('shows shortcut conflicts and prevents saving invalid shortcut drafts', async () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Shortcuts/ }));

    const shortcutButton = screen.getByRole('button', { name: 'Set shortcut for Command Palette' });
    fireEvent.click(shortcutButton);
    await waitFor(() => expect(shortcutButton).toHaveTextContent('Press keys…'));
    fireEvent.keyDown(shortcutButton, { key: 'p', metaKey: true });

    expect(await screen.findByRole('alert')).toHaveTextContent('already assigned to Quick Open');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('reports when update checks are unavailable outside packaged Electron', () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));
    expect(screen.getByText('Restores local preferences and clears the configured HackMD token. Notes and vault files are not deleted.')).toBeVisible();
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
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));

    const checkingButton = screen.getByRole('button', { name: 'Checking…' });
    expect(checkingButton).toBeDisabled();
    expect(checkingButton.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith('You’re already on the latest version of HackDesk.');
    });
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });
});
