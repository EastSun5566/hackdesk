import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DocumentSummary,
  ElectronSafeSettings,
  FolderSummary,
  HackDeskCommandPaletteCommand,
  HackDeskElectronAPI,
  NoteSummary,
} from '@/lib/electron-api';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ELECTRON_RECENT_NOTES_STORAGE_KEY } from '@/lib/electron-recent-notes';
import { defaultSettings } from '@/lib/settings';
import { LAST_WORKSPACE_SCOPE_KEY } from './electron-home/ui-preferences';
import { Home } from './Home';

vi.setConfig({ testTimeout: 15_000 });

const note: NoteSummary = {
  id: 'note-1',
  title: 'Test note',
  description: '',
  tags: [],
  updatedAtMillis: 1_700_000_000_000,
  createdAtMillis: 1_700_000_000_000,
  publishedAtMillis: null,
  tagsUpdatedAtMillis: null,
  titleUpdatedAtMillis: null,
  content: null,
  publishLink: 'https://hackmd.io/s/note-1',
  shortId: 'note-1',
  permalink: null,
  teamPath: null,
  userPath: 'michael',
  publishType: 'edit',
  readPermission: 'guest',
  writePermission: 'owner',
  lastChangeUser: null,
  folderPaths: [],
};

const document: DocumentSummary = {
  ...note,
  content: '# Test note',
};

const folder: FolderSummary = {
  id: 'folder-1',
  name: 'Projects',
  description: null,
  icon: null,
  color: null,
  parentId: null,
  clientId: null,
  createdAtMillis: 1_700_000_000_000,
  updatedAtMillis: 1_700_000_000_000,
};

const childFolder: FolderSummary = {
  ...folder,
  id: 'folder-2',
  name: 'Archive',
  parentId: 'folder-1',
};

const team = {
  id: 'team-1',
  ownerId: null,
  name: 'Team Workspace',
  logo: null,
  path: 'team-workspace',
  description: null,
  visibility: 'private' as const,
  createdAtMillis: 1_700_000_000_000,
  upgraded: false,
};

function renderHome(api: HackDeskElectronAPI) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  window.hackdeskAPI = api;

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <Home />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

async function selectOption(
  label: string,
  optionName: string | RegExp,
  container: HTMLElement = globalThis.document.body,
  optionIndex: 'first' | 'last' = 'first',
) {
  const trigger = within(container).getByRole('combobox', { name: label });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  const options = await screen.findAllByRole('option', { name: optionName });
  const option = optionIndex === 'last' ? options[options.length - 1] : options[0];
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

function findRenderedNoteTitle() {
  return screen.findByDisplayValue('Test note', {}, { timeout: 3000 });
}

function findHackmdOnboardingDialog() {
  return screen.findByRole('dialog', { name: 'Connect HackMD' });
}

function queryHackmdOnboardingDialog() {
  return screen.queryByRole('dialog', { name: 'Connect HackMD' });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function openInspector() {
  fireEvent.click(screen.getByRole('button', { name: 'Expand inspector' }));
  await screen.findByRole('heading', { name: 'Inspector' });
}

async function expandInspectorSection(name: string) {
  const trigger = await screen.findByRole('button', { name });
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
  }
}

async function openDocumentActions() {
  fireEvent.pointerDown(screen.getAllByRole('button', { name: 'More actions' })[0]);
  await screen.findByRole('menuitem', { name: 'Open in HackMD' });
}

async function openNavigatorActions() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Navigator actions' }));
  await screen.findByRole('menuitem', { name: 'New Folder' });
}

async function confirmDisconnectHackmd() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open settings for Michael' }));
  fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect HackMD' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Disconnect HackMD?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect HackMD' }));
}

async function expandTagBrowser() {
  const trigger = await screen.findByRole('button', { name: 'Tags' });
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
  }
}

async function openSearchScopeMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Search scope' }));
  await screen.findByRole('menuitem', { name: 'Workspace' });
}

async function selectCurrentFolderScope() {
  await openSearchScopeMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Current Folder' }));
}

type HackDeskElectronAPIOverrides = Partial<Omit<HackDeskElectronAPI, 'settings' | 'hackmd' | 'shell' | 'app'>> & {
  settings?: Partial<HackDeskElectronAPI['settings']>;
  hackmd?: Partial<HackDeskElectronAPI['hackmd']>;
  shell?: Partial<HackDeskElectronAPI['shell']>;
  app?: Partial<HackDeskElectronAPI['app']>;
};

function createSafeSettings(overrides: Partial<ElectronSafeSettings> = {}): ElectronSafeSettings {
  return {
    title: 'HackDesk',
    appearance: defaultSettings.appearance,
    editor: defaultSettings.editor,
    hasHackmdApiToken: true,
    hasAppearanceSettings: true,
    hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    hasLocalVault: false,
    localVault: defaultSettings.localVault,
    onboarding: defaultSettings.onboarding,
    shouldShowHackmdOnboarding: false,
    ...overrides,
  };
}

function createApi(overrides: HackDeskElectronAPIOverrides = {}): HackDeskElectronAPI {
  const base: HackDeskElectronAPI = {
    getRuntimeEnvironment: () => 'electron',
    platform: 'darwin',
    settings: {
      get: vi.fn(async () => createSafeSettings()),
      update: vi.fn(async (input) => createSafeSettings(input)),
      importHackmdCliToken: vi.fn(async () => ({
        settings: createSafeSettings({ hasHackmdApiToken: true }),
        user: {
          id: 'user-1',
          email: 'michael@example.com',
          name: 'Michael',
          username: 'michael',
          photo: null,
          upgraded: false,
          teams: [],
        },
      })),
    },
    hackmd: {
      validateToken: vi.fn(),
      getCurrentUser: vi.fn(async () => ({
        source: 'remote',
        data: {
          id: 'user-1',
          email: 'michael@example.com',
          name: 'Michael',
          username: 'michael',
          photo: null,
          upgraded: false,
          teams: [],
        },
      })),
      listTeams: vi.fn(async () => ({ source: 'remote', data: [] })),
      listNotes: vi.fn(async () => ({ source: 'remote', data: [note] })),
      listTeamNotes: vi.fn(),
      listHistory: vi.fn(),
      listFolders: vi.fn(async () => ({ source: 'remote', data: [] })),
      listTeamFolders: vi.fn(),
      getFolder: vi.fn(async () => ({ source: 'remote', data: folder })),
      getTeamFolder: vi.fn(),
      getFolderOrder: vi.fn(async () => ({ source: 'remote', data: {} })),
      getTeamFolderOrder: vi.fn(async () => ({ source: 'remote', data: {} })),
      createFolder: vi.fn(async () => folder),
      createTeamFolder: vi.fn(),
      updateFolder: vi.fn(async (_folderId: string, input: { name?: string; parentFolderId?: string | null }) => ({
        ...folder,
        name: input.name ?? folder.name,
        parentId: input.parentFolderId ?? folder.parentId,
      })),
      updateTeamFolder: vi.fn(),
      deleteFolder: vi.fn(async () => undefined),
      deleteTeamFolder: vi.fn(),
      updateFolderOrder: vi.fn(),
      updateTeamFolderOrder: vi.fn(),
      getNote: vi.fn(async () => ({ source: 'remote', data: document })),
      createNote: vi.fn(async () => document),
      createTeamNote: vi.fn(),
      updateNote: vi.fn(async () => document),
      updateTeamNote: vi.fn(),
      deleteNote: vi.fn(async () => undefined),
      deleteTeamNote: vi.fn(),
      uploadNoteImage: vi.fn(async () => ({ link: 'https://hackmd.io/uploads/image.png' })),
    },
    localVault: {
      choose: vi.fn(async () => ({ canceled: true })),
      getSnapshot: vi.fn(async () => null),
      readNote: vi.fn(),
      createNote: vi.fn(),
      writeNote: vi.fn(),
      renameNote: vi.fn(),
      moveNote: vi.fn(),
      trashNote: vi.fn(),
      revealNote: vi.fn(async () => undefined),
      importAttachment: vi.fn(async () => ({ link: 'attachments/image.png', relativePath: 'attachments/image.png' })),
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      moveFolder: vi.fn(),
      trashFolder: vi.fn(),
      revealFolder: vi.fn(async () => undefined),
      revealRoot: vi.fn(async () => undefined),
      onDidChange: vi.fn(() => () => undefined),
    },
    shell: {
      openExternal: vi.fn(),
      openHackmdEditor: vi.fn(),
    },
    app: {
      confirm: vi.fn(async () => ({ confirmed: false })),
      exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
      recordFatalRendererError: vi.fn(async () => undefined),
      writeClipboardText: vi.fn(async () => undefined),
      saveTextFile: vi.fn(async () => '/tmp/test-note.md'),
      openTextFile: vi.fn(async () => null),
      checkForUpdates: vi.fn(async () => ({ status: 'upToDate' })),
      getQuickCaptureShortcutStatus: vi.fn(async () => ({
        accelerator: 'Control+Alt+H',
        registered: true,
      })),
      submitQuickCapture: vi.fn(async () => ({ accepted: true })),
      hideQuickCapture: vi.fn(async () => undefined),
      resolveQuickCaptureSubmission: vi.fn(async () => undefined),
      onCommand: vi.fn(() => () => undefined),
      onCloseRequest: vi.fn(() => () => undefined),
      confirmClose: vi.fn(async () => undefined),
      cancelClose: vi.fn(async () => undefined),
    },
  };

  return {
    ...base,
    ...overrides,
    settings: { ...base.settings, ...overrides.settings },
    hackmd: { ...base.hackmd, ...overrides.hackmd },
    localVault: { ...base.localVault, ...overrides.localVault },
    shell: { ...base.shell, ...overrides.shell },
    app: { ...base.app, ...overrides.app },
  };
}

describe('Home native-feel behavior', () => {
  beforeEach(() => {
    delete window.hackdeskAPI;
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    delete window.hackdeskAPI;
    window.localStorage.clear();
    globalThis.document.body.style.pointerEvents = '';
  });

  it('does not delete a note when native confirmation is cancelled', async () => {
    const api = createApi();

    renderHome(api);

    await findRenderedNoteTitle();
    await openDocumentActions();
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(api.app.confirm).toHaveBeenCalledWith(expect.objectContaining({
      destructive: true,
      confirmLabel: 'Delete',
    })));
    expect(api.hackmd.deleteNote).not.toHaveBeenCalled();
  });

  it('deletes a note after native confirmation succeeds', async () => {
    const api = createApi({
      app: {
        confirm: vi.fn(async () => ({ confirmed: true })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);

    await findRenderedNoteTitle();
    await openDocumentActions();
    fireEvent.click(screen.getByText('Delete'));

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
        confirm: vi.fn(async () => ({ confirmed: true })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);

    await findRenderedNoteTitle();
    await openDocumentActions();
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(api.hackmd.deleteNote).toHaveBeenCalledWith('note-1'));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY) ?? '[]')).toEqual([]));
  });

  it('closes transient panels with Escape', async () => {
    const api = createApi();

    renderHome(api);

    await findRenderedNoteTitle();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings for Michael' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('opens first-run HackMD onboarding when no token is configured', async () => {
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
      },
    });

    renderHome(api);

    expect(await findHackmdOnboardingDialog()).toBeInTheDocument();
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
    expect(await screen.findByRole('button', { name: `${team.name}, private` })).toBeInTheDocument();
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
    expect(screen.getByTestId('workspace-rail-account-attention')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open settings. HackMD account needs attention' })).toBeInTheDocument();
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
      onboarding: { hackmdTokenSetupDeferred: true },
      shouldShowHackmdOnboarding: false,
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
        update: updateSettings,
      },
    });

    renderHome(api);
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
      hasLocalVault: true,
      localVault: { path: '/Users/michael/Notes' },
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
          hasLocalVault: true,
          localVault: { path: '/Users/michael/Notes' },
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
        update: updateSettings,
      },
      hackmd: { getCurrentUser, listFolders, listNotes, validateToken },
    });

    renderHome(api);
    const onboardingDialog = await findHackmdOnboardingDialog();
    fireEvent.change(within(onboardingDialog).getByLabelText('HackMD API Token'), {
      target: { value: ' secret-token ' },
    });
    fireEvent.click(within(onboardingDialog).getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(validateToken).toHaveBeenCalledWith('secret-token'));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      title: 'HackDesk',
      hackmdApiToken: 'secret-token',
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
    expect(await screen.findByRole('button', { name: 'Open settings for Michael' })).toBeInTheDocument();
  });

  it('opens a local folder from HackMD onboarding as a secondary path', async () => {
    const chooseLocalVault = vi.fn(async () => ({
      canceled: false,
      settings: createSafeSettings({
        hasHackmdApiToken: false,
        hasLocalVault: true,
        localVault: { path: '/Users/michael/Notes' },
        onboarding: { hackmdTokenSetupDeferred: false },
        shouldShowHackmdOnboarding: false,
      }),
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
      },
      localVault: {
        choose: chooseLocalVault,
      },
    });

    renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Open local folder' }));

    await waitFor(() => expect(chooseLocalVault).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({
      type: 'local',
      label: 'Local Vault',
    });
  });

  it('imports a hackmd-cli token from first-run HackMD onboarding', async () => {
    const importHackmdCliToken = vi.fn(async () => ({
      settings: createSafeSettings({
        hasHackmdApiToken: true,
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
          hackmdCliConfig: { hasAccessToken: true, hasCustomEndpoint: false },
          onboarding: { hackmdTokenSetupDeferred: false },
          shouldShowHackmdOnboarding: true,
        })),
        importHackmdCliToken,
      },
    });

    renderHome(api);
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
      onboarding: { hackmdTokenSetupDeferred: false },
      shouldShowHackmdOnboarding: false,
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          onboarding: { hackmdTokenSetupDeferred: true },
          shouldShowHackmdOnboarding: false,
        })),
        update: updateSettings,
      },
      hackmd: { validateToken },
    });

    renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Configure Token' }));

    const onboardingDialog = await findHackmdOnboardingDialog();
    fireEvent.change(within(onboardingDialog).getByLabelText('HackMD API Token'), {
      target: { value: 'configured-token' },
    });
    fireEvent.click(within(onboardingDialog).getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      title: 'HackDesk',
      hackmdApiToken: 'configured-token',
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
      hasLocalVault: true,
      localVault: { path: '/Users/michael/Notes' },
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
    fireEvent.click(await screen.findByRole('button', { name: 'Open settings for Michael' }));
    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), {
      target: { value: 'settings-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(validateToken).toHaveBeenCalledWith('settings-token'));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      title: 'HackDesk',
      hackmdApiToken: 'settings-token',
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
    expect(await screen.findByRole('button', { name: `${team.name}, private` })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: note.title })).toBeInTheDocument();
    await findRenderedNoteTitle();
    await confirmDisconnectHackmd();

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      hackmdApiToken: '',
      onboarding: { hackmdTokenSetupDeferred: true },
    }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Configure Token' })).toBeInTheDocument());
    expect(queryHackmdOnboardingDialog()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open settings for Michael' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `${team.name}, private` })).not.toBeInTheDocument();
    expect(screen.queryByText('TEAMS')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: note.title })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(note.title)).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({
      type: 'personal',
      label: 'My Workspace',
    });
  });

  it('switches to Local Vault after disconnecting HackMD when a vault is configured', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({ type: 'history', label: 'History' }));
    const updateSettings = vi.fn(async () => createSafeSettings({
      hasHackmdApiToken: false,
      hasLocalVault: true,
      localVault: { path: '/Users/michael/Notes' },
      onboarding: { hackmdTokenSetupDeferred: true },
      shouldShowHackmdOnboarding: false,
    }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasLocalVault: true,
          localVault: { path: '/Users/michael/Notes' },
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
        label: 'Local Vault',
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
    expect(screen.getByTestId('workspace-rail-footer-avatar')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toEqual({});
  });

  it('clears cached HackMD account data when Reset All removes the token', async () => {
    const updateSettings = vi.fn(async () => createSafeSettings({
      hasHackmdApiToken: false,
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
    fireEvent.click(await screen.findByRole('button', { name: 'Open settings for Michael' }));
    fireEvent.click(screen.getByRole('tab', { name: /Advanced/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset All Settings' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Reset All Settings?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset All Settings' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      hackmdApiToken: '',
    })));
    expect(await screen.findByRole('heading', { name: 'Connect HackMD' })).toBeInTheDocument();
    expect(screen.queryByText('Michael')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `${team.name}, private` })).not.toBeInTheDocument();
  });

  it('confirms the native close request when the current note is clean', async () => {
    let closeHandler: (() => void) | null = null;
    const api = createApi({
      app: {
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();

    act(() => {
      closeHandler?.();
    });

    await waitFor(() => expect(api.app.confirmClose).toHaveBeenCalled());
    expect(api.app.cancelClose).not.toHaveBeenCalled();
    expect(api.app.confirm).not.toHaveBeenCalled();
  });

  it('cancels the native close request when dirty note discard is rejected', async () => {
    let closeHandler: (() => void) | null = null;
    const api = createApi({
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Unsaved title' } });

    act(() => {
      closeHandler?.();
    });

    await waitFor(() => expect(api.app.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Close HackDesk',
      confirmLabel: 'Close',
      cancelLabel: 'Keep Editing',
      destructive: true,
    })));
    await waitFor(() => expect(api.app.cancelClose).toHaveBeenCalled());
    expect(api.app.confirmClose).not.toHaveBeenCalled();
  });

  it('confirms the native close request after dirty note discard is accepted', async () => {
    let closeHandler: (() => void) | null = null;
    const api = createApi({
      app: {
        confirm: vi.fn(async () => ({ confirmed: true })),
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Unsaved title' } });

    act(() => {
      closeHandler?.();
    });

    await waitFor(() => expect(api.app.confirmClose).toHaveBeenCalled());
    expect(api.app.cancelClose).not.toHaveBeenCalled();
  });

  it('summarizes every dirty tab before closing the window', async () => {
    let closeHandler: (() => void) | null = null;
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    fireEvent.change(await screen.findByDisplayValue('Product Plan'), { target: { value: 'Draft Product Plan' } });
    await screen.findByText('Unsaved');
    fireEvent.click(await screen.findByRole('button', { name: 'Design Spec' }));
    fireEvent.change(await screen.findByDisplayValue('Design Spec'), { target: { value: 'Draft Design Spec' } });
    await screen.findAllByText('Unsaved');

    act(() => {
      closeHandler?.();
    });

    await waitFor(() => expect(api.app.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Close HackDesk',
      message: 'Close 2 unsaved notes?',
      detail: expect.stringContaining('2 notes have unsaved changes'),
      confirmLabel: 'Close',
      cancelLabel: 'Keep Editing',
      destructive: true,
    })));
    await waitFor(() => expect(api.app.cancelClose).toHaveBeenCalled());
    expect(api.app.confirmClose).not.toHaveBeenCalled();
  });

  it('asks before closing when an inactive document save failed', async () => {
    let closeHandler: (() => void) | null = null;
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
        updateNote: vi.fn(async () => {
          throw new Error('HackMD is offline.');
        }),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    fireEvent.change(await screen.findByDisplayValue('Product Plan'), { target: { value: 'Draft Product Plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByLabelText('Sync state: Save failed');
    fireEvent.click(await screen.findByRole('button', { name: 'Design Spec' }));
    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();

    act(() => {
      closeHandler?.();
    });

    await waitFor(() => expect(api.app.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Close HackDesk',
      detail: expect.stringContaining('1 note has a failed save'),
      confirmLabel: 'Close',
    })));
    await waitFor(() => expect(api.app.cancelClose).toHaveBeenCalled());
    expect(api.app.confirmClose).not.toHaveBeenCalled();
  });

  it('closes the command palette before cancelling the native close request', async () => {
    let closeHandler: (() => void) | null = null;
    const api = createApi({
      app: {
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog')).toHaveTextContent('Command Palette');

    act(() => {
      closeHandler?.();
    });

    await waitFor(() => expect(screen.queryByText('Command Palette')).not.toBeInTheDocument());
    await waitFor(() => expect(api.app.cancelClose).toHaveBeenCalled());
    expect(api.app.confirmClose).not.toHaveBeenCalled();
  });

  it('closes open dialogs before cancelling the native close request', async () => {
    let closeHandler: (() => void) | null = null;
    const api = createApi({
      app: {
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings for Michael' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    act(() => {
      closeHandler?.();
    });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument());
    await waitFor(() => expect(api.app.cancelClose).toHaveBeenCalled());
    expect(api.app.confirmClose).not.toHaveBeenCalled();
  });

  it('asks before closing when the current document save failed', async () => {
    let closeHandler: (() => void) | null = null;
    const api = createApi({
      hackmd: {
        updateNote: vi.fn(async () => {
          throw new Error('HackMD is offline.');
        }),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Unsaved title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByLabelText('Sync state: Save failed');

    act(() => {
      closeHandler?.();
    });

    await waitFor(() => expect(api.app.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Close HackDesk',
      message: 'Close “Unsaved title”?',
      detail: expect.stringContaining('1 note has a failed save'),
      confirmLabel: 'Close',
      cancelLabel: 'Keep Editing',
      destructive: true,
    })));
    await waitFor(() => expect(api.app.cancelClose).toHaveBeenCalled());
    expect(api.app.confirmClose).not.toHaveBeenCalled();
  });

  it('shows empty API folders and creates notes inside the selected folder', async () => {
    const createdDocument = {
      ...document,
      id: 'created-note',
      title: 'Folder note',
      folderPaths: [folder],
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        createNote: vi.fn(async () => createdDocument),
        getNote: vi.fn(async () => ({ source: 'remote', data: createdDocument })),
      },
    });

    renderHome(api);

    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));
    fireEvent.change(await screen.findByLabelText('Note title'), { target: { value: 'Folder note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.hackmd.createNote).toHaveBeenCalledWith({
      title: 'Folder note',
      content: '',
      parentFolderId: 'folder-1',
    }));
  });

  it('exports the current editor draft as markdown', async () => {
    const api = createApi();

    renderHome(api);

    const titleInput = await findRenderedNoteTitle();
    fireEvent.change(titleInput, { target: { value: 'Draft: Test note' } });
    await openDocumentActions();
    fireEvent.click(screen.getByText('Export Markdown'));

    await waitFor(() => expect(api.app.saveTextFile).toHaveBeenCalledWith({
      defaultFileName: 'Draft- Test note.md',
      content: '# Test note',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    }));
  });

  it('imports a markdown file into the selected folder from the shared action registry command', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const importedDocument = {
      ...document,
      id: 'imported-note',
      title: 'Imported Note',
      shortId: 'imported-note',
      content: '# Imported Note\n\nBody',
      folderPaths: [folder],
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        createNote: vi.fn(async () => importedDocument),
        getNote: vi.fn(async () => ({ source: 'remote', data: importedDocument })),
      },
      app: {
        openTextFile: vi.fn(async () => ({
          filePath: '/tmp/imported.md',
          fileName: 'imported.md',
          content: '# Imported Note\n\nBody',
        })),
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);

    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);
    act(() => {
      commandHandler?.({ type: 'import-markdown-note' });
    });

    await waitFor(() => expect(api.hackmd.createNote).toHaveBeenCalledWith({
      title: 'Imported Note',
      content: '# Imported Note\n\nBody',
      parentFolderId: 'folder-1',
    }));
  });

  it('does not create a note when markdown import is cancelled', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const api = createApi({
      app: {
        openTextFile: vi.fn(async () => null),
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    act(() => {
      commandHandler?.({ type: 'import-markdown-note' });
    });

    await waitFor(() => expect(api.app.openTextFile).toHaveBeenCalled());
    expect(api.hackmd.createNote).not.toHaveBeenCalled();
  });

  it('exports debug logs from the shared action registry command', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const api = createApi({
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    act(() => {
      commandHandler?.({ type: 'export-debug-logs' });
    });

    await waitFor(() => expect(api.app.exportDebugLogs).toHaveBeenCalled());
  });

  it('edits the selected folder from the shared action registry command', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        updateFolder: vi.fn(async (_folderId: string, input: { name?: string }) => ({
          ...folder,
          name: input.name ?? folder.name,
        })),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);
    act(() => {
      commandHandler?.({ type: 'rename-folder' });
    });
    expect(await screen.findByRole('heading', { name: 'Edit Folder' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Projects' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.hackmd.updateFolder).toHaveBeenCalledWith('folder-1', {
      name: 'Renamed Projects',
      description: null,
      icon: null,
      color: null,
    }));
  });

  it('releases pointer lock after closing the folder edit dialog', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);
    act(() => {
      commandHandler?.({ type: 'rename-folder' });
    });

    expect(await screen.findByRole('heading', { name: 'Edit Folder' })).toBeInTheDocument();
    globalThis.document.body.style.pointerEvents = 'none';
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(globalThis.document.body.style.pointerEvents).toBe(''));
    expect(screen.queryByRole('heading', { name: 'Edit Folder' })).not.toBeInTheDocument();
  });

  it('renames the current note through the editor header save action', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        updateNote: vi.fn(async (_noteId, input) => ({
          ...document,
          title: input.title ?? document.title,
          content: input.content ?? document.content,
        })),
      },
    });

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Renamed note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      title: 'Renamed note',
      content: '# Test note',
    }));
  });

  it('shows document sync states for loaded, cached, and failed saves', async () => {
    const updateFailure = new Error('HackMD rejected the save.');
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        getNote: vi.fn(async () => ({
          source: 'error',
          error: 'HackMD is offline.',
          data: document,
        })),
        updateNote: vi.fn(async () => {
          throw updateFailure;
        }),
      },
    });

    renderHome(api);

    expect(await screen.findByLabelText('Sync state: Cached')).toBeInTheDocument();

    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Save failure' } });
    await waitFor(() => expect(screen.getByLabelText('Sync state: Unsaved')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByLabelText('Sync state: Save failed')).toBeInTheDocument();
  });

  it('shows saved sync state after loading a remote document', async () => {
    const api = createApi();

    renderHome(api);

    expect(await screen.findByLabelText('Sync state: Saved')).toBeInTheDocument();
  });

  it('uses a single editor surface without exposing document actions inline', async () => {
    const api = createApi();

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Draft title' } });

    expect(screen.getByTestId('hackmd-markdown-editor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'HackMD' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete note' })).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue('Draft title')).toBeInTheDocument();
  });

  it('saves the current draft from the single editor surface', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        updateNote: vi.fn(async (_noteId, input) => ({
          ...document,
          title: input.title ?? document.title,
          content: input.content ?? document.content,
        })),
      },
    });

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Reader draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      title: 'Reader draft',
      content: '# Test note',
    }));
  });

  it('saves a dirty note with the shared keyboard action', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        updateNote: vi.fn(async (_noteId, input) => ({
          ...document,
          title: input.title ?? document.title,
          content: input.content ?? document.content,
        })),
      },
    });

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Keyboard note' } });
    fireEvent.keyDown(window, { key: 's', metaKey: true });

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      title: 'Keyboard note',
      content: '# Test note',
    }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Keyboard note')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Select Keyboard note tab' })).toBeInTheDocument();
    });
  });

  it('opens quick capture content as an active unsaved draft tab', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const api = createApi({
      app: {
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();

    act(() => {
      commandHandler?.({
        type: 'quick-capture:create-draft',
        content: '# Captured\n\nBody',
        requestId: 'capture-request',
        expiresAt: Date.now() + 1000,
      });
    });

    expect(await screen.findByDisplayValue('Untitled')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Select Untitled tab' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('hackmd-markdown-editor')).toHaveTextContent('Captured');
    });
    expect(api.hackmd.createNote).not.toHaveBeenCalled();
    expect(api.app.resolveQuickCaptureSubmission).toHaveBeenCalledWith({
      requestId: 'capture-request',
      accepted: true,
    });
  });

  it('shows disabled command palette actions with concrete reasons', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'p', metaKey: true, shiftKey: true });

    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument();
    expect(screen.getAllByText('Select a folder first.').length).toBeGreaterThan(0);
    expect(screen.getByText('No unsaved note changes.')).toBeInTheDocument();
  });

  it('switches the global editor mode from the command palette', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), {
      target: { value: 'vim editor mode' },
    });
    fireEvent.click(await within(palette).findByText('Use Vim Editor Mode'));

    await waitFor(() => expect(api.settings.update).toHaveBeenCalledWith({
      title: 'HackDesk',
      editor: { mode: 'vim' },
    }));
    await waitFor(() => expect(window.document.querySelector('.cm-editor')).toHaveAttribute('data-editor-mode', 'vim'));
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
  });

  it('quick-opens a matching note with Cmd+P', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 1000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], folderPaths: [folder], updatedAtMillis: 3000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Product Plan' }, { timeout: 5_000 });
    fireEvent.keyDown(window, { key: 'p', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Quick Open' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and workspaces…'), { target: { value: 'design' } });
    fireEvent.click(await within(palette).findByText('Design Spec'));

    expect(screen.queryByRole('dialog', { name: 'Quick Open' })).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
  });

  it('does not show the previous document while the selected note is loading', async () => {
    const secondNoteDeferred = createDeferred<{ source: 'remote'; data: DocumentSummary }>();
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn((noteId: string) => {
          if (noteId === 'note-design') {
            return secondNoteDeferred.promise;
          }

          return Promise.resolve({
            source: 'remote' as const,
            data: { ...document, id: noteId, title: 'Product Plan', content: '# Product Plan' },
          });
        }),
      },
    });

    renderHome(api);
    expect(await screen.findByDisplayValue('Product Plan')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Design Spec' }));

    expect(screen.queryByDisplayValue('Product Plan')).not.toBeInTheDocument();
    expect(screen.getAllByText('Loading note…').length).toBeGreaterThan(0);

    await act(async () => {
      secondNoteDeferred.resolve({
        source: 'remote',
        data: { ...document, id: 'note-design', title: 'Design Spec', content: '# Design Spec' },
      });
    });

    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
  });

  it('opens another note in a tab without discarding the dirty current tab', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);
    const titleInput = await screen.findByDisplayValue('Product Plan');
    fireEvent.change(titleInput, { target: { value: 'Draft Product Plan' } });
    await screen.findByText('Unsaved');
    fireEvent.click(await screen.findByRole('button', { name: 'Design Spec' }));

    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
    expect(api.app.confirm).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Select Draft Product Plan tab' }));
    expect(await screen.findByDisplayValue('Draft Product Plan')).toBeInTheDocument();
  });

  it('focuses an existing tab when the same note is selected again', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: true })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);
    fireEvent.change(await screen.findByDisplayValue('Product Plan'), { target: { value: 'Draft Product Plan' } });
    await screen.findByText('Unsaved');
    fireEvent.click(await screen.findByRole('button', { name: 'Design Spec' }));
    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Product Plan' }));

    expect(await screen.findByDisplayValue('Draft Product Plan')).toBeInTheDocument();
    expect(api.app.confirm).not.toHaveBeenCalled();
  });

  it('closes the active clean tab with Cmd+W and focuses the previous tab', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
    });

    renderHome(api);
    await screen.findByDisplayValue('Product Plan');
    fireEvent.click(await screen.findByRole('button', { name: 'Design Spec' }));
    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'w', metaKey: true });

    expect(await screen.findByDisplayValue('Product Plan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select Design Spec tab' })).not.toBeInTheDocument();
    expect(api.app.confirm).not.toHaveBeenCalled();
  });

  it('cancels the native keyboard close request after closing the last clean tab', async () => {
    let closeHandler: ((request: HackDeskCloseRequest) => void) | null = null;
    const api = createApi({
      app: {
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();

    act(() => {
      closeHandler?.({ source: 'keyboard-shortcut' });
    });

    await waitFor(() => expect(api.app.cancelClose).toHaveBeenCalled());
    expect(api.app.confirmClose).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'No note selected' })).toBeInTheDocument();
  });

  it('keeps a dirty tab open when Cmd+W discard is cancelled', async () => {
    const api = createApi({
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
      },
    });

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Unsaved title' } });
    await screen.findByText('Unsaved');

    fireEvent.keyDown(window, { key: 'w', metaKey: true });

    await waitFor(() => expect(api.app.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Close Tab',
      message: 'Close “Unsaved title”?',
      confirmLabel: 'Close Tab',
      cancelLabel: 'Keep Editing',
      destructive: true,
    })));
    expect(screen.getByDisplayValue('Unsaved title')).toBeInTheDocument();
  });

  it('splits the active note into a second editor pane', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();

    fireEvent.keyDown(window, { key: '\\', metaKey: true });

    expect(await screen.findAllByRole('button', { name: 'Select Test note tab' })).toHaveLength(1);
    expect(screen.getAllByText('Test note').length).toBeGreaterThan(1);
  });

  it('opens a duplicate active note tab with Cmd+T', async () => {
    const api = createApi();

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Draft title' } });
    fireEvent.keyDown(window, { key: 't', metaKey: true });

    expect(await screen.findAllByRole('button', { name: 'Select Draft title tab' })).toHaveLength(2);
  });

  it('focuses note tabs with Cmd+number and Cmd+arrow shortcuts', async () => {
    const notes = [
      { ...note, id: 'note-a', title: 'Alpha', shortId: 'alpha', updatedAtMillis: 3000 },
      { ...note, id: 'note-b', title: 'Beta', shortId: 'beta', updatedAtMillis: 2000 },
      { ...note, id: 'note-c', title: 'Gamma', shortId: 'gamma', updatedAtMillis: 1000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-a' ? 'Alpha' : noteId === 'note-b' ? 'Beta' : 'Gamma',
            content: `# ${noteId}`,
          },
        })),
      },
    });

    renderHome(api);
    await screen.findByDisplayValue('Alpha');
    fireEvent.click(await screen.findByRole('button', { name: 'Beta' }));
    await screen.findByDisplayValue('Beta');
    fireEvent.click(await screen.findByRole('button', { name: 'Gamma' }));
    await screen.findByDisplayValue('Gamma');

    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(await screen.findByDisplayValue('Alpha')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true, altKey: true });
    expect(await screen.findByDisplayValue('Beta')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft', metaKey: true, altKey: true });
    expect(await screen.findByDisplayValue('Alpha')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '9', metaKey: true });
    expect(await screen.findByDisplayValue('Gamma')).toBeInTheDocument();
  });

  it('navigates focused note locations with titlebar buttons and Cmd+brackets', async () => {
    const notes = [
      { ...note, id: 'note-a', title: 'Alpha', shortId: 'alpha', updatedAtMillis: 3000 },
      { ...note, id: 'note-b', title: 'Beta', shortId: 'beta', updatedAtMillis: 2000 },
      { ...note, id: 'note-c', title: 'Gamma', shortId: 'gamma', updatedAtMillis: 1000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-a' ? 'Alpha' : noteId === 'note-b' ? 'Beta' : 'Gamma',
            content: `# ${noteId}`,
          },
        })),
      },
    });

    renderHome(api);
    await screen.findByDisplayValue('Alpha');
    fireEvent.click(await screen.findByRole('button', { name: 'Beta' }));
    await screen.findByDisplayValue('Beta');
    fireEvent.click(await screen.findByRole('button', { name: 'Gamma' }));
    await screen.findByDisplayValue('Gamma');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByDisplayValue('Beta')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: ']', metaKey: true });
    expect(await screen.findByDisplayValue('Gamma')).toBeInTheDocument();
  });

  it('focuses workspace note search with slash and releases Cmd+Shift+F', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    const searchInput = screen.getByRole('textbox', { name: 'Search notes' });
    fireEvent.keyDown(window, { key: 'f', metaKey: true, shiftKey: true });
    expect(searchInput).not.toHaveFocus();
    fireEvent.keyDown(window, { key: '/' });

    await waitFor(() => expect(searchInput).toHaveFocus());
  });

  it('focuses the note navigator with Cmd+Shift+E', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'e', metaKey: true, shiftKey: true });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Test note' })).toHaveFocus());
  });

  it('focuses the editor body after selecting a note from the navigator', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
    });

    renderHome(api);
    await screen.findByDisplayValue('Product Plan');
    fireEvent.click(await screen.findByRole('button', { name: 'Design Spec' }));

    await waitFor(() => {
      const editorContent = screen.getByTestId('hackmd-markdown-editor').querySelector('.cm-content');
      expect(editorContent).toHaveFocus();
    });
  });

  it('does not focus the note title input when opening note search with Cmd+F', async () => {
    const api = createApi();

    renderHome(api);
    const titleInput = await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'f', metaKey: true });

    await waitFor(() => expect(titleInput).not.toHaveFocus());
  });

  it('leaves macOS Ctrl+F available for editor text navigation', async () => {
    const api = createApi();

    renderHome(api);
    const titleInput = await findRenderedNoteTitle();
    titleInput.focus();
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    expect(titleInput).toHaveFocus();
  });

  it('toggles the workspace sidebar with Cmd+B', async () => {
    const api = createApi();

    renderHome(api);
    expect(await screen.findByRole('button', { name: 'Collapse workspace sidebar' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Collapse note navigator' })).not.toHaveLength(0);

    fireEvent.keyDown(window, { key: 'b', metaKey: true });

    expect(await screen.findByRole('button', { name: 'Expand workspace sidebar' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Collapse note navigator' })).not.toHaveLength(0);
  });

  it('leaves macOS Ctrl+B available for editor text navigation', async () => {
    const api = createApi();

    renderHome(api);
    expect(await screen.findByRole('button', { name: 'Collapse workspace sidebar' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Collapse workspace sidebar' })).toBeInTheDocument();
  });

  it('toggles the note navigator with Cmd+Option+B', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();

    fireEvent.keyDown(window, { key: 'b', altKey: true, metaKey: true });

    expect(screen.getByRole('button', { name: 'Expand note navigator' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button', { name: 'Expand note navigator' })).toHaveLength(1);
    expect(window.document.getElementById('note-navigator-panel')).toHaveStyle({ width: '0px' });
  });

  it('updates the tab title from the draft title', async () => {
    const api = createApi();

    renderHome(api);
    fireEvent.change(await findRenderedNoteTitle(), { target: { value: 'Draft title' } });

    expect(await screen.findByRole('button', { name: 'Select Draft title tab' })).toBeInTheDocument();
  });

  it('closes tabs to the right and reopens the last closed tab', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const notes = [
      { ...note, id: 'note-a', title: 'Alpha', shortId: 'alpha', updatedAtMillis: 3000 },
      { ...note, id: 'note-b', title: 'Beta', shortId: 'beta', updatedAtMillis: 2000 },
      { ...note, id: 'note-c', title: 'Gamma', shortId: 'gamma', updatedAtMillis: 1000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-a' ? 'Alpha' : noteId === 'note-b' ? 'Beta' : 'Gamma',
            content: `# ${noteId}`,
          },
        })),
      },
      app: {
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await screen.findByDisplayValue('Alpha');
    fireEvent.click(await screen.findByRole('button', { name: 'Beta' }));
    await screen.findByDisplayValue('Beta');
    fireEvent.click(await screen.findByRole('button', { name: 'Gamma' }));
    await screen.findByDisplayValue('Gamma');
    fireEvent.click(await screen.findByRole('button', { name: 'Select Alpha tab' }));

    act(() => {
      commandHandler?.({ type: 'close-tabs-to-right' });
    });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Select Beta tab' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Select Gamma tab' })).not.toBeInTheDocument();

    act(() => {
      commandHandler?.({ type: 'reopen-last-closed-tab' });
    });

    expect(await screen.findByRole('button', { name: 'Select Gamma tab' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select Beta tab' })).not.toBeInTheDocument();
  });

  it('restores note tabs after remounting the same workspace scope', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
    });

    renderHome(api);
    await screen.findByDisplayValue('Product Plan');
    fireEvent.click(await screen.findByRole('button', { name: 'Design Spec' }));
    await screen.findByDisplayValue('Design Spec');
    await waitFor(() => expect(Array.from({ length: window.localStorage.length }, (_value, index) => window.localStorage.key(index)).some((key) => (
      key?.startsWith('hackdesk_note_workspace:personal')
    ))).toBe(true));

    cleanup();
    renderHome(api);

    expect(await screen.findByRole('button', { name: 'Select Product Plan tab' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
  });

  it('closes duplicated matching tabs after deleting a note', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    let notes = [note];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        deleteNote: vi.fn(async (noteId: string) => {
          notes = notes.filter((candidate) => candidate.id !== noteId);
        }),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: true })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: '\\', metaKey: true, shiftKey: true });
    expect(await screen.findAllByRole('button', { name: 'Select Test note tab' })).toHaveLength(1);
    expect(screen.getAllByText('Test note').length).toBeGreaterThan(1);
    act(() => {
      commandHandler?.({ type: 'delete-note' });
    });

    await waitFor(() => expect(api.hackmd.deleteNote).toHaveBeenCalledWith('note-1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Select Test note tab' })).not.toBeInTheDocument());
  });

  it('does not auto-select a folder note over a dirty current tab', async () => {
    const rootNote = { ...note, id: 'root-note', title: 'Root Note', shortId: 'root-note', folderPaths: [], updatedAtMillis: 3000 };
    const folderNote = { ...note, id: 'folder-note', title: 'Folder Note', shortId: 'folder-note', folderPaths: [folder], updatedAtMillis: 2000 };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [rootNote, folderNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'folder-note' ? 'Folder Note' : 'Root Note',
            content: noteId === 'folder-note' ? '# Folder Note' : '# Root Note',
            folderPaths: noteId === 'folder-note' ? [folder] : [],
          },
        })),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);
    fireEvent.change(await screen.findByDisplayValue('Root Note'), { target: { value: 'Draft Root Note' } });
    await screen.findByText('Unsaved');
    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);

    expect(api.app.confirm).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Draft Root Note')).toBeInTheDocument();
  });

  it('quick-opens another note without discarding a dirty current tab', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);
    fireEvent.change(await screen.findByDisplayValue('Product Plan'), { target: { value: 'Draft Product Plan' } });
    await screen.findByText('Unsaved');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'design' } });
    fireEvent.click(await within(palette).findByText('Design Spec'));

    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
    expect(api.app.confirm).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Select Draft Product Plan tab' }));
    expect(await screen.findByDisplayValue('Draft Product Plan')).toBeInTheDocument();
  });

  it('quick-opens a folder from the command palette', async () => {
    const folderNote = { ...note, id: 'folder-note', title: 'Folder Note', shortId: 'folder-note', folderPaths: [folder] };
    const rootNote = { ...note, id: 'root-note', title: 'Root Note', shortId: 'root-note', folderPaths: [] };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [folderNote, rootNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Folder Note' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'Projects' } });
    fireEvent.click(await within(palette).findByText('Projects'));

    await selectCurrentFolderScope();

    await screen.findByText('1 result');
    expect(screen.getByRole('button', { name: 'Folder Note' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Root Note' })).not.toBeInTheDocument();
  });

  it('quick-opens the Root folder from the command palette', async () => {
    const folderNote = { ...note, id: 'folder-note', title: 'Folder Note', shortId: 'folder-note', folderPaths: [folder] };
    const rootNote = { ...note, id: 'root-note', title: 'Root Note', shortId: 'root-note', folderPaths: [] };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [folderNote, rootNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Root Note' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'Root' } });
    fireEvent.click(await within(palette).findByText('Root'));

    await selectCurrentFolderScope();

    await screen.findByText('1 result');
    expect(screen.getByRole('button', { name: 'Root Note' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Folder Note' })).not.toBeInTheDocument();
  });

  it('applies the command palette query to Note Finder results', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Product Plan' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'Design' } });
    fireEvent.click(await within(palette).findByText('Show Finder Results for “Design”'));

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search notes')).toHaveValue('Design');
    await screen.findByText('1 result');
    expect(screen.getByRole('button', { name: 'Design Spec' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Product Plan' })).not.toBeInTheDocument();
  });

  it('records selected notes and shows them in command palette recent notes', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
      },
    });

    renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Product Plan' }, { timeout: 5_000 }));

    expect(JSON.parse(window.localStorage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY) ?? '[]')[0]).toMatchObject({
      noteId: 'note-product',
      title: 'Product Plan',
      shortId: 'product',
      teamPath: null,
    });

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });

    expect(within(palette).getByText('Recent Notes')).toBeInTheDocument();
    expect(within(palette).getByText('Workspaces')).toBeInTheDocument();
    expect(within(palette).getByText('Quick Actions')).toBeInTheDocument();
    expect(within(palette).queryByText('Notes')).not.toBeInTheDocument();
    expect(within(palette).queryByText('Folders')).not.toBeInTheDocument();
    expect(within(palette).getAllByText('Product Plan')).toHaveLength(1);
  });

  it('quick-opens a recent note from the loaded workspace', async () => {
    window.localStorage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify([{
      noteId: 'note-design',
      teamPath: null,
      title: 'Design Spec',
      shortId: 'design',
      lastOpenedAtMillis: 3000,
    }]));
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
          },
        })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Product Plan' }, { timeout: 5_000 });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    const recentGroup = within(palette).getByText('Recent Notes').closest('[cmdk-group]')!;
    fireEvent.click(within(recentGroup as HTMLElement).getByRole('option', { name: /Design Spec/ }));

    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
  });

  it('quick-opens a recent note without discarding a dirty current tab', async () => {
    window.localStorage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify([{
      noteId: 'note-design',
      teamPath: null,
      title: 'Design Spec',
      shortId: 'design',
      lastOpenedAtMillis: 3000,
    }]));
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: false })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);
    fireEvent.change(await screen.findByDisplayValue('Product Plan'), { target: { value: 'Draft Product Plan' } });
    await screen.findByText('Unsaved');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.click(within(palette).getAllByText('Design Spec')[0]);

    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
    expect(api.app.confirm).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Select Draft Product Plan tab' }));
    expect(await screen.findByDisplayValue('Draft Product Plan')).toBeInTheDocument();
  });

  it('switches to a team workspace and opens a pending team recent note', async () => {
    window.localStorage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify([{
      noteId: 'team-note',
      teamPath: team.path,
      title: 'Team Recent',
      shortId: 'team-note',
      lastOpenedAtMillis: 3000,
    }]));
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        getCurrentUser: vi.fn(async () => ({
          source: 'remote',
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
        listTeams: vi.fn(async () => ({ source: 'remote', data: [team] })),
        listTeamNotes: vi.fn(async () => ({ source: 'remote', data: [{
          ...note,
          id: 'team-note',
          title: 'Team Recent',
          shortId: 'team-note',
          teamPath: team.path,
          userPath: null,
        }] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote', data: [] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: 'Team Recent',
            shortId: 'team-note',
            teamPath: team.path,
            userPath: null,
          },
        })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Test note' }, { timeout: 5_000 });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.click(within(palette).getByText('Team Recent'));

    await waitFor(() => expect(api.hackmd.listTeamNotes).toHaveBeenCalledWith('team-workspace'));
    expect(await screen.findByDisplayValue('Team Recent')).toBeInTheDocument();
  });

  it('switches workspaces from command palette workspace results', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        getCurrentUser: vi.fn(async () => ({
          source: 'remote',
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
        listTeams: vi.fn(async () => ({ source: 'remote', data: [team] })),
        listTeamNotes: vi.fn(async () => ({ source: 'remote', data: [] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote', data: [] })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Test note' }, { timeout: 5_000 });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'team-workspace' } });
    fireEvent.click(await within(palette).findByText('Team Workspace'));

    await waitFor(() => expect(api.hackmd.listTeamNotes).toHaveBeenCalledWith('team-workspace'));
    expect(JSON.parse(window.localStorage.getItem(LAST_WORKSPACE_SCOPE_KEY) ?? '{}')).toMatchObject({
      type: 'team',
      teamPath: 'team-workspace',
    });
  });

  it('opens History from the shared command palette action', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listHistory: vi.fn(async () => ({ source: 'remote', data: [] })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'history' } });
    fireEvent.click(await within(palette).findByText('Go to History'));

    await waitFor(() => expect(api.hackmd.listHistory).toHaveBeenCalledWith(40));
    expect(await screen.findByText('No history yet')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const historyPalette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(historyPalette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'new note' } });

    expect(await within(historyPalette).findByText('Choose My Workspace or a team first.')).toBeInTheDocument();
  });

  it('restores the last active history workspace on startup', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({ type: 'history', label: 'History' }));
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listHistory: vi.fn(async () => ({ source: 'remote', data: [] })),
      },
    });

    renderHome(api);

    await waitFor(() => expect(api.hackmd.listHistory).toHaveBeenCalledWith(40));
    expect(await screen.findByText('No history yet')).toBeInTheDocument();
  });

  it('keeps the note inspector collapsed by default and toggles it from the editor header', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();

    expect(screen.queryByRole('heading', { name: 'Inspector' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toHaveAttribute('aria-expanded', 'false');

    await openInspector();

    expect(screen.getByRole('button', { name: 'Collapse inspector' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }));
    expect(screen.queryByRole('heading', { name: 'Inspector' })).not.toBeInTheDocument();
  });

  it('exposes consistent expanded state for collapsible workspace and navigator panels', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();

    expect(screen.getByRole('button', { name: 'Collapse workspace sidebar' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: 'Collapse note navigator' })[0]).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse workspace sidebar' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Collapse note navigator' })[0]);

    expect(screen.getByRole('button', { name: 'Expand workspace sidebar' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Expand note navigator' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button', { name: 'Expand note navigator' })).toHaveLength(1);
    expect(window.document.getElementById('note-navigator-panel')).toHaveStyle({ width: '0px' });
  });

  it('exposes expanded state when folders are collapsed and expanded', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder, childFolder] })),
      },
    });

    renderHome(api);

    expect(await screen.findByRole('button', { name: 'Collapse Projects' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Projects' }));

    expect(screen.getByRole('button', { name: 'Expand Projects' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('updates note metadata from the inspector', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        updateNote: vi.fn(async (_noteId, input) => ({
          ...document,
          description: input.description ?? document.description,
          tags: input.tags ?? document.tags,
          readPermission: input.readPermission ?? document.readPermission,
          writePermission: input.writePermission ?? document.writePermission,
        })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    await openInspector();

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated metadata' } });
    const tagInput = screen.getByLabelText('Tags');
    fireEvent.change(tagInput, { target: { value: 'desktop' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    await expandInspectorSection('Permissions');
    fireEvent.click(within(screen.getByRole('group', { name: 'Read' })).getByRole('radio', { name: 'Signed in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      description: 'Updated metadata',
      tags: ['desktop'],
      readPermission: 'signed_in',
    }));
  });

  it('copies a HackMD link from the inspector header', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    await openInspector();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }));

    await waitFor(() => expect(api.app.writeClipboardText).toHaveBeenCalledWith('https://hackmd.io/@michael/note-1'));
  });

  it('copies a markdown link from the share dialog', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    await openDocumentActions();
    fireEvent.click(screen.getByText('Share…'));

    const dialog = await screen.findByRole('dialog', { name: 'Share Note' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy Markdown link' }));

    await waitFor(() => expect(api.app.writeClipboardText).toHaveBeenCalledWith('[Test note](https://hackmd.io/@michael/note-1)'));
  });

  it('updates sharing permissions from the share dialog', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        updateNote: vi.fn(async (_noteId, input) => ({
          ...document,
          readPermission: input.readPermission ?? document.readPermission,
          writePermission: input.writePermission ?? document.writePermission,
        })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    await openDocumentActions();
    fireEvent.click(screen.getByText('Share…'));

    const dialog = await screen.findByRole('dialog', { name: 'Share Note' });
    await selectOption('Read Access', 'Signed-in users', dialog, 'first');
    await selectOption('Write Access', 'Signed-in users', dialog, 'last');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Access' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      readPermission: 'signed_in',
      writePermission: 'signed_in',
    }));
  });

  it('moves a note to a selected folder from the inspector', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        updateNote: vi.fn(async (_noteId, input) => ({
          ...document,
          folderPaths: input.parentFolderId ? [folder] : document.folderPaths,
        })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    await openInspector();

    await expandInspectorSection('Location');
    await selectOption('Folder', 'Projects');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      parentFolderId: 'folder-1',
    }));
  });

  it('moves a note to root from the inspector with null parentFolderId', async () => {
    const folderNote = { ...note, folderPaths: [folder] };
    const folderDocument = { ...document, folderPaths: [folder] };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [folderNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        getNote: vi.fn(async () => ({ source: 'remote', data: folderDocument })),
        updateNote: vi.fn(async () => ({ ...folderDocument, folderPaths: [] })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    await openInspector();

    await expandInspectorSection('Location');
    await selectOption('Folder', 'Root');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      parentFolderId: null,
    }));
  });

  it('pastes an image into the editor draft and saves the inserted markdown image', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        uploadNoteImage: vi.fn(async () => ({ link: 'https://cdn.test/diagram.png' })),
        updateNote: vi.fn(async (_noteId, input) => ({
          ...document,
          content: input.content ?? document.content,
        })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const content = editor.querySelector('.cm-content');
    const file = new File(['image-bytes'], 'diagram.png', { type: 'image/png' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    });
    expect(content).not.toBeNull();
    fireEvent.paste(content as Element, {
      clipboardData: {
        files: [file],
        getData: () => '',
      },
    });

    await waitFor(() => expect(api.hackmd.uploadNoteImage).toHaveBeenCalledWith('note-1', expect.objectContaining({
      fileName: 'diagram.png',
      mimeType: 'image/png',
    })));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      title: 'Test note',
      content: expect.stringContaining('![diagram.png](https://cdn.test/diagram.png)'),
    }));
  });

  it('creates folders with optional metadata fields', async () => {
    const createdFolder = {
      ...folder,
      name: 'Design',
      description: 'Design notes',
      icon: '1F4C1',
      color: '#2F80ED',
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        createFolder: vi.fn(async () => createdFolder),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    await openNavigatorActions();
    fireEvent.click(screen.getByText('New Folder'));
    const dialog = within(await screen.findByRole('dialog', { name: 'New Folder' }));
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Design' } });
    fireEvent.change(dialog.getByLabelText('Description'), { target: { value: 'Design notes' } });
    fireEvent.click(dialog.getByRole('radio', { name: 'Folder' }));
    fireEvent.click(dialog.getByRole('radio', { name: 'Use folder color #2F80ED' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.hackmd.createFolder).toHaveBeenCalledWith({
      name: 'Design',
      description: 'Design notes',
      icon: '1F4C1',
      color: '#2F80ED',
    }));
  });

  it('renders folder icon and color metadata in the folder tree', async () => {
    const folderWithMetadata = {
      ...folder,
      icon: '1F4C1',
      color: '#2F80ED',
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folderWithMetadata] })),
      },
    });

    const { container } = renderHome(api);

    expect(await screen.findByText('Projects')).toBeInTheDocument();
    const glyph = container.querySelector('[data-folder-id="folder-1"] [data-folder-glyph="1F4C1"]');

    expect(glyph).toHaveTextContent('📁');
    expect(glyph).toHaveAttribute('data-folder-color', '#2F80ED');
  });

  it('renders note rows as draggable without breaking selection', async () => {
    const firstNote = { ...note, id: 'note-first', title: 'First note', shortId: 'first', updatedAtMillis: 3000 };
    const secondNote = { ...note, id: 'note-second', title: 'Second note', shortId: 'second', updatedAtMillis: 2000 };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [firstNote, secondNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-second' ? 'Second note' : 'First note',
          },
        })),
      },
    });

    const { container } = renderHome(api);
    expect(await screen.findByDisplayValue('First note')).toBeInTheDocument();
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-second"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });

    expect(within(row).getByRole('button', { name: 'Drag Second note' })).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Second note' }));

    expect(await screen.findByDisplayValue('Second note')).toBeInTheDocument();
  });

  it('selects a note when clicking its drag handle without starting a drag', async () => {
    const firstNote = { ...note, id: 'note-first', title: 'First note', shortId: 'first', updatedAtMillis: 3000 };
    const secondNote = { ...note, id: 'note-second', title: 'Second note', shortId: 'second', updatedAtMillis: 2000 };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [firstNote, secondNote] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-second' ? 'Second note' : 'First note',
          },
        })),
      },
    });

    const { container } = renderHome(api);
    expect(await screen.findByDisplayValue('First note')).toBeInTheDocument();
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-second"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });

    fireEvent.click(within(row).getByRole('button', { name: 'Drag Second note' }));

    expect(await screen.findByDisplayValue('Second note')).toBeInTheDocument();
  });

  it('does not expose note drag handles in search results', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.change(screen.getByPlaceholderText('Search notes'), { target: { value: 'Test' } });

    await screen.findByText('1 result');
    expect(screen.queryByRole('button', { name: 'Drag Test note' })).not.toBeInTheDocument();
  });

  it('filters notes by tag and removes active filter chips', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Product Plan' });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Filter notes' }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'product' }));
    fireEvent.pointerDown(window.document.body);

    await screen.findByText('1 result');
    expect(screen.getByRole('button', { name: 'Product Plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Design Spec' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag filter product' }));

    await screen.findByText('2 notes');
    expect(screen.getByRole('button', { name: 'Design Spec' })).toBeInTheDocument();
  });

  it('filters notes from the tag browser and clears the active tag when clicked again', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Product Plan' });
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveAttribute('aria-expanded', 'false');
    await expandTagBrowser();
    await screen.findByRole('button', { name: 'Filter by tag product' });
    fireEvent.click(screen.getByRole('button', { name: 'Filter by tag product' }));

    await screen.findByText('1 result');
    expect(screen.getByRole('button', { name: 'Product Plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Design Spec' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear tag product' }));

    await screen.findByText('2 notes');
    expect(screen.getByRole('button', { name: 'Design Spec' })).toBeInTheDocument();
  });

  it('shows filter dropdown multi-tag state in the tag browser', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], updatedAtMillis: 2000 },
      { ...note, id: 'note-ops', title: 'Ops Runbook', shortId: 'ops', tags: ['ops'], updatedAtMillis: 1000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
      },
    });

    renderHome(api);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Filter notes' }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'product' }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'design' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove tag filter product', hidden: true })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Clear tag product', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear tag design', hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear tag ops', hidden: true })).not.toBeInTheDocument();
  });

  it('toggles long tag lists with show all and show less', async () => {
    const notes = Array.from({ length: 13 }, (_, index) => ({
      ...note,
      id: `note-${index + 1}`,
      title: `Note ${index + 1}`,
      shortId: `note-${index + 1}`,
      tags: [`tag-${String(index + 1).padStart(2, '0')}`],
      updatedAtMillis: 3000 - index,
    }));
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Note 1' });
    await expandTagBrowser();
    await screen.findByRole('button', { name: 'Filter by tag tag-01' });
    expect(screen.queryByRole('button', { name: 'Filter by tag tag-13' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show 7 more' }));

    expect(screen.getByRole('button', { name: 'Filter by tag tag-13' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));

    expect(screen.queryByRole('button', { name: 'Filter by tag tag-13' })).not.toBeInTheDocument();
  });

  it('uses the tag browser in history scope', async () => {
    const historyNotes = [
      { ...note, id: 'history-product', title: 'History Product', shortId: 'history-product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'history-design', title: 'History Design', shortId: 'history-design', tags: ['design'], updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listHistory: vi.fn(async () => ({ source: 'remote', data: historyNotes })),
      },
    });

    renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'History' }));
    await screen.findByRole('button', { name: 'History Product' });
    await expandTagBrowser();
    fireEvent.click(await screen.findByRole('button', { name: 'Filter by tag product' }));

    await screen.findByText('1 result');
    expect(screen.getByRole('button', { name: 'History Product' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'History Design' })).not.toBeInTheDocument();
  });

  it('sorts finder results by title', async () => {
    const notes = [
      { ...note, id: 'note-b', title: 'Beta', shortId: 'beta', updatedAtMillis: 3000 },
      { ...note, id: 'note-a', title: 'Alpha', shortId: 'alpha', updatedAtMillis: 1000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
      },
    });

    const { container } = renderHome(api);
    await screen.findByRole('button', { name: 'Beta' });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Sort notes' }));
    fireEvent.click(await screen.findByText('Title A-Z'));

    await waitFor(() => {
      expect([...container.querySelectorAll('[data-note-id]')].map((row) => row.getAttribute('data-note-id'))).toEqual([
        'note-a',
        'note-b',
      ]);
    });
  });

  it('disables current folder scope when no folder is selected and filters direct folder notes when selected', async () => {
    const folderNote = { ...note, id: 'folder-note', title: 'Folder Note', shortId: 'folder-note', folderPaths: [folder] };
    const childNote = {
      ...note,
      id: 'child-note',
      title: 'Child Note',
      shortId: 'child-note',
      folderPaths: [folder, childFolder],
    };
    const rootNote = { ...note, id: 'root-note', title: 'Root Note', shortId: 'root-note', folderPaths: [] };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [folderNote, childNote, rootNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder, childFolder] })),
      },
    });

    renderHome(api);
    const [projectsLabel] = await screen.findAllByText('Projects');
    await openSearchScopeMenu();
    expect(screen.getByRole('menuitem', { name: 'Current Folder' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }));
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Current Folder' })).not.toBeInTheDocument());

    fireEvent.click(projectsLabel.closest('button')!);
    await selectCurrentFolderScope();

    await screen.findByText('1 result');
    expect(screen.getByRole('button', { name: 'Folder Note' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Child Note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Root Note' })).not.toBeInTheDocument();
  });

  it('clears finder query and filters with Escape without changing editor input', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
          },
        })),
      },
    });

    renderHome(api);
    await screen.findByDisplayValue('Product Plan');
    fireEvent.change(screen.getByPlaceholderText('Search notes'), { target: { value: 'Product' } });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Filter notes' }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'product' }));

    const titleInput = screen.getByDisplayValue('Product Plan');
    fireEvent.change(titleInput, { target: { value: 'Draft Title' } });
    fireEvent.keyDown(titleInput, { key: 'Escape' });

    expect(screen.getByDisplayValue('Draft Title')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search notes')).toHaveValue('Product');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByPlaceholderText('Search notes')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Remove tag filter product' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Remove tag filter product' })).not.toBeInTheDocument();
  });

  it('moves a personal note to the selected folder from the note context menu', async () => {
    const movedDocument = {
      ...document,
      folderPaths: [folder],
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [{ ...note, folderPaths: [] }] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        updateNote: vi.fn(async () => movedDocument),
      },
    });

    const { container } = renderHome(api);
    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Move to Selected Folder'));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      parentFolderId: 'folder-1',
    }));
  });

  it('moves a personal note to root from the note context menu with null parentFolderId', async () => {
    const folderNote = { ...note, folderPaths: [folder] };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [folderNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        updateNote: vi.fn(async () => ({ ...document, folderPaths: [] })),
      },
    });

    const { container } = renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Root' }));
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Move to Selected Folder'));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      parentFolderId: null,
    }));
  });

  it('copies a HackMD link from the note context menu', async () => {
    const api = createApi();

    const { container } = renderHome(api);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Copy HackMD Link'));

    await waitFor(() => expect(api.app.writeClipboardText).toHaveBeenCalledWith('https://hackmd.io/@michael/note-1'));
  });

  it('falls back to Web Clipboard when Electron clipboard IPC is unavailable', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const api = createApi();
    delete api.app.writeClipboardText;

    const { container } = renderHome(api);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Copy HackMD Link'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://hackmd.io/@michael/note-1'));
  });

  it('copies a markdown link from the note context menu', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({
          source: 'remote',
          data: [{ ...note, title: 'A [Note]' }],
        })),
        getNote: vi.fn(async () => ({
          source: 'remote',
          data: { ...document, title: 'A [Note]' },
        })),
      },
    });

    const { container } = renderHome(api);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Copy Markdown Link'));

    await waitFor(() => expect(api.app.writeClipboardText).toHaveBeenCalledWith('[A \\[Note\\]](https://hackmd.io/@michael/note-1)'));
  });

  it('duplicates a personal note from the note context menu and selects the copy', async () => {
    const duplicated = {
      ...document,
      id: 'note-copy',
      title: 'Copy of Test note',
      shortId: 'note-copy',
      folderPaths: [folder],
      content: '# Test note',
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [{ ...note, folderPaths: [folder] }] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: noteId === 'note-copy' ? duplicated : { ...document, folderPaths: [folder] },
        })),
        createNote: vi.fn(async () => duplicated),
      },
    });

    const { container } = renderHome(api);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Duplicate Note'));

    await waitFor(() => expect(api.hackmd.createNote).toHaveBeenCalledWith({
      title: 'Copy of Test note',
      content: '# Test note',
      description: '',
      tags: [],
      readPermission: 'guest',
      writePermission: 'owner',
      parentFolderId: 'folder-1',
    }));
    expect(await screen.findByDisplayValue('Copy of Test note')).toBeInTheDocument();
    expect(window.localStorage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY)).toContain('note-copy');
  });

  it('moves a team note through the team update endpoint from the note context menu', async () => {
    const teamNote = {
      ...note,
      teamPath: team.path,
      userPath: null,
      folderPaths: [],
    };
    const movedDocument = {
      ...document,
      teamPath: team.path,
      userPath: null,
      folderPaths: [folder],
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        getCurrentUser: vi.fn(async () => ({
          source: 'remote',
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
        listTeams: vi.fn(async () => ({ source: 'remote', data: [team] })),
        listTeamNotes: vi.fn(async () => ({ source: 'remote', data: [teamNote] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        getTeamFolderOrder: vi.fn(async () => ({ source: 'remote', data: {} })),
        getNote: vi.fn(async () => ({ source: 'remote', data: movedDocument })),
        updateTeamNote: vi.fn(async () => movedDocument),
      },
    });

    const { container } = renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Team Workspace, private' }, { timeout: 5_000 }));
    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Move to Selected Folder'));

    await waitFor(() => expect(api.hackmd.updateTeamNote).toHaveBeenCalledWith('team-workspace', 'note-1', {
      parentFolderId: 'folder-1',
    }));
  });

  it('moves a team note to root through the team update endpoint from the note context menu', async () => {
    const teamNote = {
      ...note,
      teamPath: team.path,
      userPath: null,
      folderPaths: [folder],
    };
    const movedDocument = {
      ...document,
      teamPath: team.path,
      userPath: null,
      folderPaths: [],
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        getCurrentUser: vi.fn(async () => ({
          source: 'remote',
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
        listTeams: vi.fn(async () => ({ source: 'remote', data: [team] })),
        listTeamNotes: vi.fn(async () => ({ source: 'remote', data: [teamNote] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        getTeamFolderOrder: vi.fn(async () => ({ source: 'remote', data: {} })),
        getNote: vi.fn(async () => ({ source: 'remote', data: movedDocument })),
        updateTeamNote: vi.fn(async () => movedDocument),
      },
    });

    const { container } = renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Team Workspace, private' }, { timeout: 5_000 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Root' }));
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Move to Selected Folder'));

    await waitFor(() => expect(api.hackmd.updateTeamNote).toHaveBeenCalledWith('team-workspace', 'note-1', {
      parentFolderId: null,
    }));
  });

  it('duplicates a team note through the team create endpoint from the note context menu', async () => {
    const teamNote = {
      ...note,
      teamPath: team.path,
      userPath: null,
      folderPaths: [folder],
    };
    const teamDocument = {
      ...document,
      teamPath: team.path,
      userPath: null,
      folderPaths: [folder],
    };
    const duplicated = {
      ...teamDocument,
      id: 'team-copy',
      title: 'Copy of Test note',
      shortId: 'team-copy',
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        getCurrentUser: vi.fn(async () => ({
          source: 'remote',
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
        listTeams: vi.fn(async () => ({ source: 'remote', data: [team] })),
        listTeamNotes: vi.fn(async () => ({ source: 'remote', data: [teamNote] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        getTeamFolderOrder: vi.fn(async () => ({ source: 'remote', data: {} })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote',
          data: noteId === 'team-copy' ? duplicated : teamDocument,
        })),
        createTeamNote: vi.fn(async () => duplicated),
      },
    });

    const { container } = renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Team Workspace, private' }, { timeout: 5_000 }));
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Duplicate Note'));

    await waitFor(() => expect(api.hackmd.createTeamNote).toHaveBeenCalledWith('team-workspace', expect.objectContaining({
      title: 'Copy of Test note',
      content: '# Test note',
      parentFolderId: 'folder-1',
    })));
    expect(await screen.findByDisplayValue('Copy of Test note')).toBeInTheDocument();
  });

  it('imports a markdown file through the team create endpoint', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const importedDocument = {
      ...document,
      id: 'team-imported-note',
      title: 'Team Imported',
      shortId: 'team-imported-note',
      teamPath: team.path,
      userPath: null,
      content: '# Team Imported',
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        getCurrentUser: vi.fn(async () => ({
          source: 'remote',
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
        listTeams: vi.fn(async () => ({ source: 'remote', data: [team] })),
        listTeamNotes: vi.fn(async () => ({ source: 'remote', data: [] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote', data: [] })),
        createTeamNote: vi.fn(async () => importedDocument),
        getNote: vi.fn(async () => ({ source: 'remote', data: importedDocument })),
      },
      app: {
        openTextFile: vi.fn(async () => ({
          filePath: '/tmp/team-imported.md',
          fileName: 'team-imported.md',
          content: '# Team Imported',
        })),
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Team Workspace, private' }, { timeout: 5_000 }));
    act(() => {
      commandHandler?.({ type: 'import-markdown-note' });
    });

    await waitFor(() => expect(api.hackmd.createTeamNote).toHaveBeenCalledWith('team-workspace', {
      title: 'Team Imported',
      content: '# Team Imported',
    }));
  });

  it('opens a note from the note context menu', async () => {
    const api = createApi();
    const { container } = renderHome(api);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Open in HackMD'));

    await waitFor(() => expect(api.shell.openHackmdEditor).toHaveBeenCalledWith({
      publishType: 'edit',
      shortId: 'note-1',
      userPath: 'michael',
      teamPath: null,
      permalink: null,
      publishLink: 'https://hackmd.io/s/note-1',
    }));
  });

  it('deletes the selected folder after native confirmation succeeds', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
        deleteFolder: vi.fn(async () => undefined),
      },
      app: {
        confirm: vi.fn(async () => ({ confirmed: true })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn((handler) => {
          commandHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);
    act(() => {
      commandHandler?.({ type: 'delete-folder' });
    });

    await waitFor(() => expect(api.app.confirm).toHaveBeenCalledWith(expect.objectContaining({
      destructive: true,
      confirmLabel: 'Delete',
    })));
    await waitFor(() => expect(api.hackmd.deleteFolder).toHaveBeenCalledWith('folder-1'));
  });
});
