import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ELECTRON_RECENT_NOTES_STORAGE_KEY } from '@/lib/electron-recent-notes';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { LAST_WORKSPACE_SCOPE_KEY } from './electron-home/ui-preferences';
import {
  useHomeTestLifecycle,
  note,
  folder,
  team,
  renderHome,
  findRenderedNoteTitle,
  editNote,
  openHackmdOnboardingDialog,
  queryHackmdOnboardingDialog,
  queryNoteRow,
  findNoteRow,
  openDocumentActions,
  expectTeamWorkspaceListed,
  openAccountSettings,
  confirmDisconnectHackmd,
  cancelDeleteNoteDialog,
  confirmDeleteNoteDialog,
  createSafeSettings,
  createApi,
} from './Home.test-utils';

vi.setConfig({ testTimeout: 15_000 });

describe('Home startup, onboarding and accounts', () => {
  useHomeTestLifecycle();

  it('does not delete a note when confirmation is cancelled', async () => {
    const api = createApi();

    renderHome(api);

    await findRenderedNoteTitle();
    await openDocumentActions();
    fireEvent.click(screen.getByText('Delete'));
    await cancelDeleteNoteDialog();

    expect(api.hackmd.deleteNote).not.toHaveBeenCalled();
  });

  it('deletes a note after confirmation succeeds', async () => {
    const api = createApi({
      app: {
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);

    await findRenderedNoteTitle();
    await openDocumentActions();
    fireEvent.click(screen.getByText('Delete'));
    await confirmDeleteNoteDialog();

    await waitFor(() => expect(api.hackmd.deleteNote).toHaveBeenCalledWith('note-1'));
  });

  it('removes a deleted note from recent notes', async () => {
    window.localStorage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify([{
      noteId: 'note-1',
      teamPath: null,
      title: 'Test note',
      shortId: 'note-1',
      lastOpenedAtMillis: 3000,
    }]));
    const api = createApi({
      app: {
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);

    await findRenderedNoteTitle();
    await openDocumentActions();
    fireEvent.click(screen.getByText('Delete'));
    await confirmDeleteNoteDialog();

    await waitFor(() => expect(api.hackmd.deleteNote).toHaveBeenCalledWith('note-1'));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY) ?? '[]')).toEqual([]));
  });

  it('closes transient panels with Escape', async () => {
    const api = createApi();

    renderHome(api);

    await findRenderedNoteTitle();
    fireEvent.click(within(screen.getByTestId('sidebar-footer')).getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('starts a recoverable draft without opening setup when no destination is configured', async () => {
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          hackmdAccounts: { accounts: [], activeAccountId: null },
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
      },
    });

    renderHome(api);

    expect(await findRenderedNoteTitle('Untitled')).toBeInTheDocument();
    expect(await screen.findByTestId('hackmd-markdown-editor', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
    await editNote('First draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('dialog', { name: 'Save note' })).toBeInTheDocument();
    expect(api.hackmd.createNote).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('hackdesk_note_workspace:initial-drafts') ?? '{}').drafts).not.toEqual({});
  });

  it('connects the configured HackMD account on startup without leaving the local vault workspace', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({ type: 'local', label: 'Local Vault' }));
    const getCurrentUser = vi.fn(async () => ({
      source: 'remote' as const,
      data: {
        id: 'user-1',
        email: 'michael@example.com',
        name: 'Michael',
        username: 'michael',
        photo: 'https://cdn.example/avatar.png',
        upgraded: false,
        teams: [],
      },
    }));
    const listTeams = vi.fn(async () => ({ source: 'remote' as const, data: [team] }));
    const listNotes = vi.fn(async () => ({ source: 'remote' as const, data: [note] }));
    const listFolders = vi.fn(async () => ({ source: 'remote' as const, data: [folder] }));
    const getFolderOrder = vi.fn(async () => ({ source: 'remote' as const, data: {} }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: true,
          hackmdAccounts: { accounts: [], activeAccountId: null },
          hasLocalVault: true,
        })),
      },
      hackmd: {
        getCurrentUser,
        listTeams,
        listNotes,
        listFolders,
        getFolderOrder,
      },
    });

    renderHome(api);

    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledOnce());
    await waitFor(() => expect(listTeams).toHaveBeenCalledOnce());
    expect(await screen.findByText('Michael')).toBeInTheDocument();
    await expectTeamWorkspaceListed();
    expect(listNotes).not.toHaveBeenCalled();
    expect(listFolders).not.toHaveBeenCalled();
    expect(getFolderOrder).not.toHaveBeenCalled();
  });

  it('keeps HackMD account sync errors out of the local vault navigator', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({ type: 'local', label: 'Local Vault' }));
    const getCurrentUser = vi.fn(async () => ({
      source: 'error' as const,
      error: 'HackMD token expired.',
    }));
    const listTeams = vi.fn(async () => ({ source: 'remote' as const, data: [] }));
    const listNotes = vi.fn(async () => ({ source: 'remote' as const, data: [note] }));
    const listFolders = vi.fn(async () => ({ source: 'remote' as const, data: [folder] }));
    const getFolderOrder = vi.fn(async () => ({ source: 'remote' as const, data: {} }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: true,
          hackmdAccounts: { accounts: [], activeAccountId: null },
          hasLocalVault: true,
        })),
      },
      hackmd: {
        getCurrentUser,
        listTeams,
        listNotes,
        listFolders,
        getFolderOrder,
      },
    });

    renderHome(api);

    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledOnce());
    await waitFor(() => expect(listTeams).toHaveBeenCalledOnce());
    expect(screen.queryByText('HackMD token expired.')).toBeNull();
    expect(screen.getByTestId('sidebar-account-attention')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account: Not signed in. HackMD account needs attention' })).toBeInTheDocument();
    expect(listNotes).not.toHaveBeenCalled();
    expect(listFolders).not.toHaveBeenCalled();
    expect(getFolderOrder).not.toHaveBeenCalled();
  });

  it('still shows remote workspace content errors in the navigator', async () => {
    const listNotes = vi.fn(async () => ({
      source: 'error' as const,
      error: 'HackMD notes are unavailable.',
    }));
    const api = createApi({
      hackmd: {
        listNotes,
      },
    });

    renderHome(api);

    expect(await screen.findByText('HackMD notes are unavailable.')).toBeInTheDocument();
    expect(listNotes).toHaveBeenCalledOnce();
  });

  it('defers first-run HackMD onboarding with Setup later', async () => {
    const updateSettings = vi.fn(async () => createSafeSettings({
      hasHackmdApiToken: false,
      hackmdAccounts: { accounts: [], activeAccountId: null },
      onboarding: { hackmdTokenSetupDeferred: true },
      shouldShowHackmdOnboarding: false,
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          hackmdAccounts: { accounts: [], activeAccountId: null },
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
        update: updateSettings,
      },
    });

    renderHome(api);
    await openHackmdOnboardingDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Setup later' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      title: 'HackDesk',
      onboarding: { hackmdTokenSetupDeferred: true },
    }));
    expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
  });

  it('validates and saves a token from first-run HackMD onboarding', async () => {
    const validateToken = vi.fn(async () => ({
      id: 'user-1',
      email: 'michael@example.com',
      name: 'Michael',
      username: 'michael',
      photo: null,
      upgraded: false,
      teams: [],
    }));
    const updateSettings = vi.fn(async () => createSafeSettings({
      hasHackmdApiToken: true,
      hackmdAccounts: { accounts: [], activeAccountId: null },
      hasLocalVault: true,
      localVault: { vaults: [{ id: 'vault-notes', path: '/Users/michael/Notes' }], activeVaultId: 'vault-notes', workspaces: [], activeWorkspaceId: null },
      onboarding: { hackmdTokenSetupDeferred: false },
      shouldShowHackmdOnboarding: false,
    }));
    const getCurrentUser = vi.fn(async () => ({
      source: 'remote' as const,
      data: {
        id: 'user-1',
        email: 'michael@example.com',
        name: 'Michael',
        username: 'michael',
        photo: null,
        upgraded: false,
        teams: [],
      },
    }));
    const listNotes = vi.fn(async () => ({ source: 'remote' as const, data: [note] }));
    const listFolders = vi.fn(async () => ({ source: 'remote' as const, data: [folder] }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          hackmdAccounts: { accounts: [], activeAccountId: null },
          hasLocalVault: true,
          localVault: { vaults: [{ id: 'vault-notes', path: '/Users/michael/Notes' }], activeVaultId: 'vault-notes', workspaces: [], activeWorkspaceId: null },
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
        update: updateSettings,
      },
      hackmd: { getCurrentUser, listFolders, listNotes, validateToken },
    });

    renderHome(api);
    const onboardingDialog = await openHackmdOnboardingDialog();
    fireEvent.change(within(onboardingDialog).getByLabelText('HackMD API Token'), {
      target: { value: ' secret-token ' },
    });
    fireEvent.click(within(onboardingDialog).getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(validateToken).toHaveBeenCalledWith('secret-token'));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      title: 'HackDesk',
      hackmdApiToken: 'secret-token',
      hackmdAccountLabel: '@michael',
    }));
    await waitFor(() => {
      expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({
      type: 'personal',
      label: 'My Workspace',
    });
    await waitFor(() => expect(listNotes).toHaveBeenCalledOnce());
    await waitFor(() => expect(listFolders).toHaveBeenCalledOnce());
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'Account: Michael' })).toBeInTheDocument();
  });

  it('opens a local folder from HackMD onboarding as a secondary path', async () => {
    const snapshot: LocalVaultSnapshot = { vaultId: 'first-vault', rootPath: '/Users/michael/Notes', notes: [], folders: [] };
    const choosePath = vi.fn(async () => ({
      canceled: false,
      snapshot,
      settings: createSafeSettings({
        hasHackmdApiToken: false,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        hasLocalVault: true,
        localVault: { vaults: [{ id: 'vault-notes', path: '/Users/michael/Notes' }], activeVaultId: 'vault-notes', workspaces: [], activeWorkspaceId: null },
        onboarding: { hackmdTokenSetupDeferred: false },
        shouldShowHackmdOnboarding: false,
      }),
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          hackmdAccounts: { accounts: [], activeAccountId: null },
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
      },
      localVault: {
        choosePath,
        measure: vi.fn(async ({ path }: { path: string }) => ({ path, name: 'tmp', notes: 1, exceedsLimit: false, limit: 20_000 })),
      },
    });

    renderHome(api);
    const onboardingDialog = await openHackmdOnboardingDialog();
    fireEvent.click(within(onboardingDialog).getByRole('button', { name: 'Open local folder' }));

    // The in-app picker opens instead of the native dialog; the app's own dialog confirms the folder.
    const picker = await screen.findByRole('dialog', { name: 'Choose a Vault Folder' });
    fireEvent.click(within(picker).getByRole('button', { name: /Choose “tmp”/ }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Use “tmp” as a vault folder?' });
    expect(choosePath).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Use Folder' }));
    await waitFor(() => expect(choosePath).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({
      type: 'local',
      label: 'Notes',
      vaultId: 'first-vault',
    });
  });

  it('imports a hackmd-cli token from first-run HackMD onboarding', async () => {
    const importHackmdCliToken = vi.fn(async () => ({
      settings: createSafeSettings({
        hasHackmdApiToken: true,
        hackmdAccounts: { accounts: [], activeAccountId: null },
        onboarding: { hackmdTokenSetupDeferred: false },
        shouldShowHackmdOnboarding: false,
      }),
      user: {
        id: 'user-1',
        email: 'michael@example.com',
        name: 'Michael',
        username: 'michael',
        photo: null,
        upgraded: false,
        teams: [],
      },
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          hackmdAccounts: { accounts: [], activeAccountId: null },
          hackmdCliConfig: { hasAccessToken: true, hasCustomEndpoint: false },
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
        importHackmdCliToken,
      },
    });

    renderHome(api);
    await openHackmdOnboardingDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Import token' }));

    await waitFor(() => expect(importHackmdCliToken).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({
      type: 'personal',
      label: 'My Workspace',
    });
  });

  it('connects to My Workspace from the empty navigator configure action', async () => {
    const validateToken = vi.fn(async () => ({
      id: 'user-1',
      email: 'michael@example.com',
      name: 'Michael',
      username: 'michael',
      photo: null,
      upgraded: false,
      teams: [],
    }));
    const updateSettings = vi.fn(async () => createSafeSettings({
      hasHackmdApiToken: true,
      hackmdAccounts: { accounts: [], activeAccountId: null },
      onboarding: { hackmdTokenSetupDeferred: false },
      shouldShowHackmdOnboarding: false,
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          hackmdAccounts: { accounts: [], activeAccountId: null },
          onboarding: { hackmdTokenSetupDeferred: true },
          shouldShowHackmdOnboarding: false,
        })),
        update: updateSettings,
      },
      hackmd: { validateToken },
    });

    renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Configure Token' }));

    const onboardingDialog = await openHackmdOnboardingDialog();
    fireEvent.change(within(onboardingDialog).getByLabelText('HackMD API Token'), {
      target: { value: 'configured-token' },
    });
    fireEvent.click(within(onboardingDialog).getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      title: 'HackDesk',
      hackmdApiToken: 'configured-token',
      hackmdAccountLabel: '@michael',
    }));
    await waitFor(() => {
      expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({
      type: 'personal',
      label: 'My Workspace',
    });
  });

  it('does not switch workspace when saving a token from Settings', async () => {
    const localSettings = createSafeSettings({
      hasHackmdApiToken: true,
      hackmdAccounts: { accounts: [], activeAccountId: null },
      hasLocalVault: true,
      localVault: { vaults: [{ id: 'vault-notes', path: '/Users/michael/Notes' }], activeVaultId: 'vault-notes', workspaces: [], activeWorkspaceId: null },
    });
    const updateSettings = vi.fn(async (input) => createSafeSettings({
      ...localSettings,
      ...input,
    }));
    const validateToken = vi.fn(async () => ({
      id: 'user-1',
      email: 'michael@example.com',
      name: 'Michael',
      username: 'michael',
      photo: null,
      upgraded: false,
      teams: [],
    }));
    const getCurrentUser = vi.fn(async () => ({
      source: 'remote' as const,
      data: {
        id: 'user-1',
        email: 'michael@example.com',
        name: 'Michael',
        username: 'michael',
        photo: null,
        upgraded: false,
        teams: [],
      },
    }));
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({
      type: 'local',
      label: 'Local Vault',
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => localSettings),
        update: updateSettings,
      },
      hackmd: { getCurrentUser, validateToken },
    });

    renderHome(api);
    await openAccountSettings();
    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), {
      target: { value: 'settings-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save new token' }));

    await waitFor(() => expect(validateToken).toHaveBeenCalledWith('settings-token'));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      title: 'HackDesk',
      hackmdApiToken: 'settings-token',
      hackmdAccountLabel: '@michael',
    }));
    expect(validateToken.mock.invocationCallOrder[0]).toBeLessThan(updateSettings.mock.invocationCallOrder[0]);
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(2));
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({
      type: 'local',
      label: 'Local Vault',
    });
  });

  it('disconnects HackMD, clears remote account data, and stays in My Workspace without reopening onboarding', async () => {
    const updateSettings = vi.fn(async () => createSafeSettings({
      hasHackmdApiToken: false,
      hackmdAccounts: { accounts: [], activeAccountId: null },
      onboarding: { hackmdTokenSetupDeferred: true },
      shouldShowHackmdOnboarding: false,
    }));
    const api = createApi({
      settings: { update: updateSettings },
      hackmd: {
        getCurrentUser: vi.fn(async () => ({
          source: 'remote' as const,
          data: {
            id: 'user-1',
            email: 'michael@example.com',
            name: 'Michael',
            username: 'michael',
            photo: null,
            upgraded: false,
            teams: [team],
          },
        })),
        listTeams: vi.fn(async () => ({ source: 'remote' as const, data: [team] })),
      },
    });

    renderHome(api);
    await expectTeamWorkspaceListed();
    expect(await findNoteRow(note.title)).toBeInTheDocument();
    await findRenderedNoteTitle();
    await confirmDisconnectHackmd();

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      hackmdApiToken: '',
      onboarding: { hackmdTokenSetupDeferred: true },
    }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Configure Token' })).toBeInTheDocument());
    expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account: Michael' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account: Not signed in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `${team.name}, private` })).not.toBeInTheDocument();
    expect(screen.queryByText('TEAMS')).not.toBeInTheDocument();
    expect(queryNoteRow(note.title)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Note location' })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({
      type: 'personal',
      label: 'My Workspace',
    });
  });

  it('switches to Local Vault after disconnecting HackMD when a vault is configured', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({ type: 'history', label: 'History' }));
    const updateSettings = vi.fn(async () => createSafeSettings({
      hasHackmdApiToken: false,
      hackmdAccounts: { accounts: [], activeAccountId: null },
      hasLocalVault: true,
      localVault: { vaults: [{ id: 'vault-notes', path: '/Users/michael/Notes' }], activeVaultId: 'vault-notes', workspaces: [], activeWorkspaceId: null },
      onboarding: { hackmdTokenSetupDeferred: true },
      shouldShowHackmdOnboarding: false,
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasLocalVault: true,
          localVault: { vaults: [{ id: 'vault-notes', path: '/Users/michael/Notes' }], activeVaultId: 'vault-notes', workspaces: [], activeWorkspaceId: null },
        })),
        update: updateSettings,
      },
      hackmd: {
        listHistory: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
      },
    });

    renderHome(api);
    await confirmDisconnectHackmd();

    await waitFor(() => expect(updateSettings).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({
        type: 'local',
        label: 'Notes',
        vaultId: 'vault-notes',
      });
    });
    expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
  });

  it('keeps Settings and the current account visible when disconnecting HackMD fails', async () => {
    const updateSettings = vi.fn(async () => {
      throw new Error('Could not disconnect HackMD');
    });
    const api = createApi({
      settings: { update: updateSettings },
    });

    renderHome(api);
    await confirmDisconnectHackmd();

    await waitFor(() => expect(updateSettings).toHaveBeenCalledOnce());
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect HackMD' })).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-footer-avatar')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({});
  });

  it('clears cached HackMD account data when Reset All removes the token', async () => {
    const updateSettings = vi.fn(async () => createSafeSettings({
      hasHackmdApiToken: false,
      hackmdAccounts: { accounts: [], activeAccountId: null },
      shouldShowHackmdOnboarding: true,
    }));
    const api = createApi({
      settings: { update: updateSettings },
      hackmd: {
        getCurrentUser: vi.fn(async () => ({
          source: 'remote' as const,
          data: {
            id: 'user-1',
            email: 'michael@example.com',
            name: 'Michael',
            username: 'michael',
            photo: null,
            upgraded: false,
            teams: [team],
          },
        })),
        listTeams: vi.fn(async () => ({ source: 'remote' as const, data: [team] })),
      },
    });

    renderHome(api);
    await openAccountSettings();
    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset All Settings' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Reset All Settings?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset All Settings' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      hackmdApiToken: '',
    })));
    // Resetting keeps Settings open on the cleared defaults.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument());
    expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
    expect(screen.queryByText('Michael')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `${team.name}, private` })).not.toBeInTheDocument();
  });
});
