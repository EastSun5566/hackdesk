import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import type {
  DocumentSummary,
  ElectronSafeSettings,
  FolderSummary,
  HackDeskElectronAPI,
  NoteSummary,
} from '@/lib/electron-api';
import { TooltipProvider } from '@/components/ui/tooltip';
import { defaultSettings } from '@/lib/settings';
import { Home } from './Home';

// Shared fixtures for the Home.*.test.tsx files. The suite is split by area so the renderer
// workers run it in parallel: each test renders the whole workbench (about a second).
export const note: NoteSummary = {
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

export const document: DocumentSummary = {
  ...note,
  content: '# Test note',
};

export const folder: FolderSummary = {
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

export const childFolder: FolderSummary = {
  ...folder,
  id: 'folder-2',
  name: 'Archive',
  parentId: 'folder-1',
};

export const team = {
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

export function renderHome(api: HackDeskElectronAPI) {
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

export async function selectOption(
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

// The note header no longer shows the title; the open note's tab does.
export function activeTabName(title: string) {
  return new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:, .+)?$`);
}

export function findRenderedNoteTitle(title = 'Test note') {
  return screen.findByRole('tab', { name: activeTabName(title), selected: true }, { timeout: 3000 });
}

export function queryRenderedNoteTitle(title: string) {
  return screen.queryByRole('tab', { name: activeTabName(title), selected: true });
}

/** Types into the open note so it has unsaved changes. */
export async function editNote(text = ' edited') {
  const editor = await screen.findByTestId('hackmd-markdown-editor');
  await waitFor(() => expect(editor.querySelector('.cm-editor')).not.toBeNull());
  const view = EditorView.findFromDOM(editor.querySelector<HTMLElement>('.cm-editor')!)!;
  act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: text } }));
}

/** Renames the open note from its More actions menu; the dialog saves right away. */
export async function renameNote(title: string) {
  await openDocumentActions();
  fireEvent.click(screen.getByRole('menuitem', { name: /^Rename…/ }));
  const field = await screen.findByLabelText('Title');
  fireEvent.change(field, { target: { value: title } });
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
}

export async function openHackmdOnboardingDialog() {
  if (!queryHackmdOnboardingDialog()) {
    await screen.findByRole('button', { name: /^Switch workspace, current:/ });
    fireEvent.keyDown(window, { key: 'P', code: 'KeyP', metaKey: true, shiftKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByRole('combobox'), { target: { value: 'Connect HackMD' } });
    fireEvent.click(await within(palette).findByRole('option', { name: /^Connect HackMD\b/ }));
  }
  return screen.findByRole('dialog', { name: 'Connect HackMD' });
}

export function queryHackmdOnboardingDialog() {
  return screen.queryByRole('dialog', { name: 'Connect HackMD' });
}

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

// Query only the navigator; scanning the whole workbench can starve pending query updates.
export function queryNoteRow(name: string) {
  // Search results show over the tree, which stays mounted (hidden) while searching.
  const results = screen.queryByLabelText('Search results') ?? screen.queryByLabelText('Recently opened notes');
  if (results) return within(results).queryByRole('button', { name });
  const tree = screen.queryByTestId('folder-navigator-tree');
  return tree ? within(tree).queryByRole('treeitem', { name }) : null;
}

export function getNoteRow(name: string) {
  const row = queryNoteRow(name);
  if (!row) throw new Error(`Note row "${name}" is not ready`);
  return row;
}

export function findNoteRow(name: string, options?: Parameters<typeof waitFor>[1]) {
  return waitFor(() => getNoteRow(name), options);
}

export async function openInspector() {
  fireEvent.click(screen.getByRole('button', { name: 'Expand note details' }));
  await screen.findByRole('heading', { name: 'Note Details' });
}

export async function openNoteSettingsFromInspector() {
  await openInspector();
  fireEvent.click(screen.getByRole('button', { name: 'Note settings' }));
  return screen.findByRole('dialog', { name: 'Note Settings' });
}

export async function openDocumentActions() {
  fireEvent.pointerDown(screen.getAllByRole('button', { name: 'More actions' })[0]);
  await screen.findByRole('menuitem', { name: 'Open in HackMD' });
}

export async function openCreateMenu() {
  // The workspace root row's context menu holds the ways to create.
  fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'My Notes' }));
  await screen.findByRole('menuitem', { name: /New Folder/ });
}

export async function openWorkspaceSwitcher() {
  if (!screen.queryByRole('dialog', { name: 'Workspaces' })) {
    fireEvent.click(await screen.findByRole('button', { name: /^Switch workspace, current: / }));
  }
  return screen.findByRole('dialog', { name: 'Workspaces' });
}

export async function findTeamWorkspace(options?: Parameters<typeof waitFor>[1]) {
  await openWorkspaceSwitcher();
  return waitFor(() => within(screen.getByTestId('workspace-switcher-team-list'))
    .getByRole('button', { name: `${team.name}, private` }), options);
}

export async function expectTeamWorkspaceListed() {
  const row = await findTeamWorkspace();
  expect(row).toBeInTheDocument();
  fireEvent.keyDown(row, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Workspaces' })).toBeNull());
}

export async function openAccountSettings() {
  const avatar = await screen.findByTestId('sidebar-footer-avatar');
  expect(avatar.closest('button')).toHaveAccessibleName('Account: Michael');
  fireEvent.click(within(screen.getByTestId('sidebar-footer')).getByRole('button', { name: 'Settings' }));
}

export async function confirmDisconnectHackmd() {
  await openAccountSettings();
  fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect HackMD' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Disconnect HackMD?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect HackMD' }));
}

export async function cancelDeleteNoteDialog() {
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete Note' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
}

export async function confirmDeleteNoteDialog() {
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete Note' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
}

export async function confirmDeleteFolderDialog() {
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete Folder' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
}

export async function acceptAppConfirmDialog(confirmLabel: string) {
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: confirmLabel }));
}

export async function cancelAppConfirmDialog(cancelLabel = 'Keep Editing') {
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: cancelLabel }));
}

// Scope, sort, permission and tag filters share the sidebar's View options menu.
export async function openViewOptions() {
  if (!screen.queryByRole('menu')) fireEvent.pointerDown(screen.getByRole('button', { name: 'View options' }));
  await screen.findByRole('menuitem', { name: 'Workspace' });
}

export function findTagOption(tag: string) {
  return screen.findByRole('menuitemcheckbox', { name: new RegExp(`^${tag}\\d`) });
}

export async function openSearchScopeMenu() {
  await openViewOptions();
}

export async function selectCurrentFolderScope() {
  await openSearchScopeMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Current Folder' }));
}

export type HackDeskElectronAPIOverrides = Partial<Omit<HackDeskElectronAPI, 'settings' | 'hackmd' | 'shell' | 'app' | 'localVault'>> & {
  settings?: Partial<HackDeskElectronAPI['settings']>;
  hackmd?: Partial<HackDeskElectronAPI['hackmd']>;
  shell?: Partial<HackDeskElectronAPI['shell']>;
  app?: Partial<HackDeskElectronAPI['app']>;
  localVault?: Partial<HackDeskElectronAPI['localVault']>;
};

export function createSafeSettings(overrides: Partial<ElectronSafeSettings> = {}): ElectronSafeSettings {
  return {
    title: 'HackDesk',
    appearance: defaultSettings.appearance,
    editor: defaultSettings.editor,
    hasHackmdApiToken: true,
    hackmdAccounts: { accounts: [], activeAccountId: null },
    hasAppearanceSettings: true,
    hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    hasLocalVault: false,
    localVault: defaultSettings.localVault,
    onboarding: defaultSettings.onboarding,
    shortcuts: defaultSettings.shortcuts,
    // The shared test team is pinned, as a user would have it, so its row shows in the switcher.
    workspaceNavigation: { pinnedTeamIds: [team.id] },
    shouldShowHackmdOnboarding: false,
    ...overrides,
  };
}

export function createApi(overrides: HackDeskElectronAPIOverrides = {}): HackDeskElectronAPI {
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
      })),
      listTeams: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
      listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [note] })),
      listTeamNotes: vi.fn(),
      listHistory: vi.fn(),
      listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
      listTeamFolders: vi.fn(),
      getFolder: vi.fn(async () => ({ source: 'remote' as const, data: folder })),
      getTeamFolder: vi.fn(),
      getFolderOrder: vi.fn(async () => ({ source: 'remote' as const, data: {} })),
      getTeamFolderOrder: vi.fn(async () => ({ source: 'remote' as const, data: {} })),
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
      getNoteIfChanged: vi.fn(async () => null),
      restoreNote: vi.fn(async () => undefined),
      listTrash: vi.fn(async () => []),
      restoreNotes: vi.fn(async () => ({})),
      listNoteComments: vi.fn(async () => ({ comments: [], page: 1, hasNext: false })),
      setNoteCommentResolved: vi.fn(async () => ({ status: 'updated' as const })),
      getNote: vi.fn(async () => ({ source: 'remote' as const, data: document })),
      createNote: vi.fn(async () => document),
      createTeamNote: vi.fn(),
      updateNote: vi.fn(async () => document),
      updateTeamNote: vi.fn(),
      deleteNote: vi.fn(async () => undefined),
      deleteTeamNote: vi.fn(),
      uploadNoteImage: vi.fn(async () => ({ link: 'https://hackmd.io/uploads/image.png' })),
      listNoteVersions: vi.fn(async () => ({ versions: [], page: 1, totalPages: 1, total: 0 })),
      getNoteVersion: vi.fn(async () => {
        throw new Error('Unexpected version read.');
      }),
      compareNoteVersions: vi.fn(async () => ({ unifiedDiff: '' })),
      createNoteVersion: vi.fn(async () => {
        throw new Error('Unexpected version write.');
      }),
      updateNoteVersion: vi.fn(async () => {
        throw new Error('Unexpected version write.');
      }),
    },
    localVault: {
      choose: vi.fn(async () => ({ canceled: true })),
      measure: vi.fn(async () => { throw new Error('Unexpected folder measure.'); }),
      activate: vi.fn(async () => ({ settings: createSafeSettings(), snapshot: null })),
      forget: vi.fn(async () => ({ settings: createSafeSettings(), snapshot: null })),
      updateWorkspace: vi.fn(async () => ({ settings: createSafeSettings(), snapshot: null })),
      disconnect: vi.fn(async () => createSafeSettings()),
      getSnapshot: vi.fn(async () => null),
      getVaultSnapshot: vi.fn(async () => { throw new Error('No vault'); }),
      readNote: vi.fn(),
      createNote: vi.fn(),
      writeNote: vi.fn(),
      renameNote: vi.fn(),
      moveNote: vi.fn(),
      trashNote: vi.fn(),
      revealNote: vi.fn(async () => undefined),
      importAttachment: vi.fn(async () => ({
        attachment: { link: 'attachments/image.png', relativePath: 'attachments/image.png' },
        snapshot: { vaultId: 'vault-test', rootPath: '/tmp/vault', notes: [], folders: [] },
      })),
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      moveFolder: vi.fn(),
      trashFolder: vi.fn(),
      revealFolder: vi.fn(async () => undefined),
      revealRoot: vi.fn(async () => undefined),
      browse: vi.fn(async () => ({ path: '/tmp', parent: '/', home: '/tmp', entries: [] })),
      choosePath: vi.fn(async () => ({ canceled: true })),
      createDirectory: vi.fn(async () => ({ path: '/tmp/new' })),
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
      checkForUpdates: vi.fn(async () => ({ status: 'upToDate' as const })),
      getQuickCaptureShortcutStatus: vi.fn(async () => ({
        shortcut: 'control+alt+h',
        registered: true,
      })),
      submitQuickCapture: vi.fn(async () => ({ accepted: true as const })),
      hideQuickCapture: vi.fn(async () => undefined),
      resolveQuickCaptureSubmission: vi.fn(async () => undefined),
      onCommand: vi.fn(() => () => undefined),
      onCloseRequest: vi.fn(() => () => undefined),
      confirmClose: vi.fn(async () => undefined),
      cancelClose: vi.fn(async () => undefined),
      newWindow: vi.fn(async () => undefined),
    },
  };

  const sessionLocalVault = base.localVault as unknown as Record<string, unknown>;
  sessionLocalVault.switchVault ??= vi.fn(async () => ({ settings: createSafeSettings(), snapshot: null }));
  sessionLocalVault.forgetVault ??= vi.fn(async () => ({ settings: createSafeSettings(), snapshot: null }));

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

/** Registers the per-test setup and cleanup every Home test file shares. */
export function useHomeTestLifecycle() {
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
}
