import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSettings } from '@/lib/settings';

import {
  createDeferred,
  renderSettingsDialog,
  validatedUser,
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

describe('SettingsDialog: HackMD accounts and local vaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHackDeskAPIMock.mockReturnValue(undefined);
    delete window.hackdeskAPI;
    window.localStorage.clear();
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

});
