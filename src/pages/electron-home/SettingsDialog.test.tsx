import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { defaultSettings } from '@/lib/settings';

import { SettingsDialog } from './SettingsDialog';

const { toastSuccessMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: toastSuccessMock,
  },
}));

function renderSettingsDialog(props: Partial<Parameters<typeof SettingsDialog>[0]> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const onChooseLocalVault = props.onChooseLocalVault ?? vi.fn(async () => undefined);
  const onForgetLocalVault = props.onForgetLocalVault ?? vi.fn(async () => undefined);
  const onOpenLocalVault = props.onOpenLocalVault ?? vi.fn(async () => undefined);
  const onRefreshLocalVault = props.onRefreshLocalVault ?? vi.fn(async () => undefined);
  const onSave = props.onSave ?? vi.fn();
  const onValidateToken = props.onValidateToken ?? vi.fn();

  render(
    <ThemeProvider defaultTheme="system" storageKey="settings-dialog-test-theme">
      <SettingsDialog
        open
        settings={{
          title: 'HackDesk',
          appearance: defaultSettings.appearance,
          editor: defaultSettings.editor,
          hasHackmdApiToken: false,
          hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
          hasLocalVault: false,
          localVault: defaultSettings.localVault,
          onboarding: defaultSettings.onboarding,
          shouldShowHackmdOnboarding: true,
        }}
        isSaving={false}
        onChooseLocalVault={onChooseLocalVault}
        onForgetLocalVault={onForgetLocalVault}
        onOpenLocalVault={onOpenLocalVault}
        onRefreshLocalVault={onRefreshLocalVault}
        onOpenChange={onOpenChange}
        onSave={onSave}
        onValidateToken={onValidateToken}
        {...props}
      />
    </ThemeProvider>,
  );

  return { onChooseLocalVault, onForgetLocalVault, onOpenLocalVault, onRefreshLocalVault, onOpenChange, onSave, onValidateToken };
}

async function selectThemeOption(optionName: string | RegExp) {
  const trigger = screen.getByRole('combobox', { name: 'Theme preset' });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(tabs).toHaveLength(6);
    expect(panels).toHaveLength(6);

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

  it('automatically activates tabs with horizontal arrow keys and loops focus', async () => {
    renderSettingsDialog();

    const generalTab = screen.getByRole('tab', { name: /General/ });
    const editorTab = screen.getByRole('tab', { name: /Editor/ });
    const advancedTab = screen.getByRole('tab', { name: /Advanced/ });

    generalTab.focus();
    fireEvent.keyDown(generalTab, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(editorTab).toHaveFocus();
      expect(editorTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel', { name: 'Editor' })).toBeVisible();
    });

    fireEvent.keyDown(editorTab, { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(generalTab).toHaveFocus();
      expect(generalTab).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.keyDown(generalTab, { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(advancedTab).toHaveFocus();
      expect(advancedTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel', { name: 'Advanced' })).toBeVisible();
    });
  });

  it('shows one settings section per tab instead of one long form', () => {
    renderSettingsDialog();

    expect(screen.getByRole('tab', { name: /General/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Window Title')).toBeVisible();
    expect(screen.getByLabelText('API Token')).not.toBeVisible();
    expect(screen.queryByText('Apply Theme')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));
    expect(screen.getByText('No local vault configured')).toBeVisible();
    expect(screen.getByLabelText('Window Title')).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    expect(screen.getByLabelText('API Token')).toBeVisible();
    expect(screen.getByLabelText('Window Title')).not.toBeVisible();
  });

  it('updates footer copy and actions with the active tab', () => {
    renderSettingsDialog();

    expect(screen.getByText('Window title and local app defaults.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    expect(screen.getByText('Theme mode, presets, fonts, and color seeds.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Apply Theme' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Vault/ }));
    const vaultFooterDescription = screen.getByText('Manage the local Markdown folder.');
    expect(vaultFooterDescription).toBeVisible();
    expect(within(vaultFooterDescription.parentElement!).getByRole('button', { name: 'Close' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Apply Theme' })).toBeNull();
  });

  it('preserves settings drafts while switching between mounted panels', () => {
    renderSettingsDialog();

    const titleInput = screen.getByLabelText('Window Title');
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
    fireEvent.click(screen.getByText('Helix'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({
      title: 'HackDesk',
      editor: { mode: 'helix' },
    });
  });

  it('resets editor mode with all other settings', () => {
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

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      editor: { mode: 'standard' },
    }));
  });

  it('closes the dialog after applying a theme from the appearance footer', () => {
    const { onOpenChange } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Theme' }));

    expect(toastSuccessMock).toHaveBeenCalledWith('Theme applied');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps custom seed inputs mounted while collapsed and preserves validation state', () => {
    renderSettingsDialog();

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

  it('shows Electron appearance typography controls and mainstream presets', () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));

    expect(screen.getByText('Typography')).toBeVisible();
    expect(screen.getByLabelText('Theme preset')).toHaveTextContent('HackMD Neo');
    expect(screen.getByLabelText('Theme preset')).not.toHaveTextContent('hackmd-neo');
    expect(screen.getByText('The default HackDesk writing palette.')).toBeVisible();
    expect(screen.getByLabelText('UI font')).toBeVisible();
    expect(screen.getByLabelText('Editor font')).toBeVisible();
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

  it('saves title and token from their tab-specific footer action', () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.change(screen.getByLabelText('Window Title'), {
      target: { value: 'Focus Desk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({ title: 'Focus Desk' });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), {
      target: { value: ' secret-token ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenLastCalledWith({
      title: 'Focus Desk',
      hackmdApiToken: 'secret-token',
    });
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
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Folders')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open in Finder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Vault' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change Vault' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget Vault' }));

    expect(onOpenLocalVault).toHaveBeenCalledOnce();
    expect(onRefreshLocalVault).toHaveBeenCalledOnce();
    expect(onChooseLocalVault).toHaveBeenCalledOnce();
    expect(onForgetLocalVault).toHaveBeenCalledOnce();
  });
});
