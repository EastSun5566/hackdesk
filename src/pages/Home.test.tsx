import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DocumentSummary,
  FolderSummary,
  HackDeskCommandPaletteCommand,
  HackDeskElectronAPI,
  NoteSummary,
} from '@/lib/electron-api';
import { ELECTRON_RECENT_NOTES_STORAGE_KEY } from '@/lib/electron-recent-notes';
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
      <Home />
    </QueryClientProvider>,
  );
}

function findRenderedNoteTitle() {
  return screen.findByDisplayValue('Test note', {}, { timeout: 3000 });
}

async function openInspector() {
  fireEvent.click(screen.getByRole('button', { name: 'Expand inspector' }));
  await screen.findByRole('heading', { name: 'Inspector' });
}

function createApi(overrides: Partial<HackDeskElectronAPI> = {}): HackDeskElectronAPI {
  return {
    getRuntimeEnvironment: () => 'electron',
    settings: {
      get: vi.fn(async () => ({ title: 'HackDesk', hasHackmdApiToken: true })),
      update: vi.fn(),
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
    shell: {
      openExternal: vi.fn(),
      openHackmdEditor: vi.fn(),
    },
    app: {
      confirm: vi.fn(async () => ({ confirmed: false })),
      exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
      recordFatalRendererError: vi.fn(async () => undefined),
      onCommand: vi.fn(() => () => undefined),
    },
    ...overrides,
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
  });

  it('does not delete a note when native confirmation is cancelled', async () => {
    const api = createApi();

    renderHome(api);

    await findRenderedNoteTitle();
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));

    await waitFor(() => expect(api.hackmd.deleteNote).toHaveBeenCalledWith('note-1'));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY) ?? '[]')).toEqual([]));
  });

  it('closes transient panels with Escape', async () => {
    const api = createApi();

    renderHome(api);

    await findRenderedNoteTitle();
    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));
    expect(screen.getByRole('heading', { name: 'New Note' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'New Note' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Folder note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.hackmd.createNote).toHaveBeenCalledWith({
      title: 'Folder note',
      content: '# Folder note\n\n',
      parentFolderId: 'folder-1',
    }));
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

  it('renames the selected folder from the shared action registry command', async () => {
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
    expect(await screen.findByRole('heading', { name: 'Rename Folder' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Projects' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(api.hackmd.updateFolder).toHaveBeenCalledWith('folder-1', {
      name: 'Renamed Projects',
      description: null,
      icon: null,
      color: null,
    }));
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
  });

  it('shows disabled command palette actions with concrete reasons', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument();
    expect(screen.getAllByText('Select a folder first.').length).toBeGreaterThan(0);
    expect(screen.getByText('No unsaved note changes.')).toBeInTheDocument();
  });

  it('quick-opens a matching note from the command palette', async () => {
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
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands'), { target: { value: 'design' } });
    fireEvent.click(await within(palette).findByText('Design Spec'));

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
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
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands'), { target: { value: 'Projects' } });
    fireEvent.click(await within(palette).findByText('Projects'));

    fireEvent.click(screen.getByRole('button', { name: 'Current Folder' }));

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
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands'), { target: { value: 'Root' } });
    fireEvent.click(await within(palette).findByText('Root'));

    fireEvent.click(screen.getByRole('button', { name: 'Current Folder' }));

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
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands'), { target: { value: 'Design' } });
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
    expect(within(palette).getAllByText('Product Plan').length).toBeGreaterThan(1);
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
    fireEvent.click(within(palette).getAllByText('Design Spec')[0]);

    expect(await screen.findByDisplayValue('Design Spec')).toBeInTheDocument();
  });

  it('switches to a team workspace from a team recent note', async () => {
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
      },
    });

    renderHome(api);
    await screen.findByRole('button', { name: 'Test note' }, { timeout: 5_000 });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.click(within(palette).getByText('Team Recent'));

    await waitFor(() => expect(api.hackmd.listTeamNotes).toHaveBeenCalledWith('team-workspace'));
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
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands'), { target: { value: 'history' } });
    fireEvent.click(await within(palette).findByText('Go to History'));

    await waitFor(() => expect(api.hackmd.listHistory).toHaveBeenCalledWith(40));
    expect(await screen.findByText('No history yet')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const historyPalette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(historyPalette).getByPlaceholderText('Search notes, folders, and commands'), { target: { value: 'new note' } });

    expect(await within(historyPalette).findByText('Choose My Workspace or a team first.')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Collapse note navigator' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse workspace sidebar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse note navigator' }));

    expect(screen.getByRole('button', { name: 'Expand workspace sidebar' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Expand note navigator' })).toHaveAttribute('aria-expanded', 'false');
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
    fireEvent.change(screen.getByLabelText('Read'), { target: { value: 'signed_in' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Metadata' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      description: 'Updated metadata',
      tags: ['desktop'],
      readPermission: 'signed_in',
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

    fireEvent.change(await screen.findByLabelText('Folder'), { target: { value: 'folder-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Metadata' }));

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

    fireEvent.change(await screen.findByLabelText('Folder'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Metadata' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      parentFolderId: null,
    }));
  });

  it('uploads an image and inserts the markdown image into the editor content', async () => {
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
    await openInspector();

    const file = new File(['image-bytes'], 'diagram.png', { type: 'image/png' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    });
    fireEvent.change(screen.getByLabelText('Upload Image'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload and Insert' }));

    await waitFor(() => expect(api.hackmd.uploadNoteImage).toHaveBeenCalledWith('note-1', expect.objectContaining({
      fileName: 'diagram.png',
      mimeType: 'image/png',
    })));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      title: 'Test note',
      content: expect.stringContaining('![diagram](https://cdn.test/diagram.png)'),
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
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));
    const dialog = within(screen.getByRole('dialog', { name: 'New Folder' }));
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Design' } });
    fireEvent.change(dialog.getByLabelText('Description'), { target: { value: 'Design notes' } });
    fireEvent.change(dialog.getByLabelText('Icon codepoint'), { target: { value: '1F4C1' } });
    fireEvent.change(dialog.getByLabelText('Color'), { target: { value: '#2F80ED' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.hackmd.createFolder).toHaveBeenCalledWith({
      name: 'Design',
      description: 'Design notes',
      icon: '1F4C1',
      color: '#2F80ED',
    }));
  });

  it('renders note rows as draggable without breaking selection', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote', data: [{ ...note, folderPaths: [] }] })),
        listFolders: vi.fn(async () => ({ source: 'remote', data: [folder] })),
      },
    });

    const { container } = renderHome(api);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });

    expect(within(row).getByRole('button', { name: 'Drag Test note' })).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Test note' }));

    expect(await findRenderedNoteTitle()).toBeInTheDocument();
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

    await screen.findByText('1 result');
    expect(screen.getByRole('button', { name: 'Product Plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Design Spec' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag filter product' }));

    await screen.findByText('2 results');
    expect(screen.getByRole('button', { name: 'Design Spec' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Current Folder' })).toBeDisabled();

    fireEvent.click(projectsLabel.closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Current Folder' }));

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
        getNote: vi.fn(async () => ({ source: 'remote', data: { ...document, title: 'Product Plan' } })),
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
    fireEvent.click(await screen.findByRole('button', { name: 'Team Workspace' }, { timeout: 5_000 }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Team Workspace' }, { timeout: 5_000 }));
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

  it('opens a note from the note context menu', async () => {
    const api = createApi();
    const { container } = renderHome(api);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Open in Web Editor'));

    await waitFor(() => expect(api.shell.openHackmdEditor).toHaveBeenCalledWith(expect.objectContaining({
      shortId: 'note-1',
    })));
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
