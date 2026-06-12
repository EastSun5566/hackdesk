import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  DocumentSummary,
  FolderSummary,
  HackDeskCommandPaletteCommand,
  HackDeskElectronAPI,
  NoteSummary,
} from '@/lib/electron-api';
import { Home } from './Home';

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
  afterEach(() => {
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

    fireEvent.click((await screen.findByText('Projects')).closest('button')!);
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
    fireEvent.click((await screen.findByText('Projects')).closest('button')!);
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
    fireEvent.click((await screen.findByText('Projects')).closest('button')!);
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
