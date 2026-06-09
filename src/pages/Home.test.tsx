import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, FolderSummary, HackDeskElectronAPI, NoteSummary } from '@/lib/electron-api';
import { Home } from './Home';

const note: NoteSummary = {
  id: 'note-1',
  title: 'Test note',
  description: '',
  tags: [],
  updatedAtMillis: 1_700_000_000_000,
  createdAtMillis: 1_700_000_000_000,
  content: null,
  publishLink: 'https://hackmd.io/s/note-1',
  shortId: 'note-1',
  permalink: null,
  teamPath: null,
  userPath: 'michael',
  publishType: 'edit',
  readPermission: 'guest',
  writePermission: 'owner',
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
      getFolderOrder: vi.fn(),
      getTeamFolderOrder: vi.fn(),
      createFolder: vi.fn(async () => folder),
      createTeamFolder: vi.fn(),
      updateFolder: vi.fn(),
      updateTeamFolder: vi.fn(),
      deleteFolder: vi.fn(),
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
    },
    shell: {
      openExternal: vi.fn(),
      openHackmdEditor: vi.fn(),
    },
    app: {
      confirm: vi.fn(async () => ({ confirmed: false })),
      onCommand: vi.fn(() => () => undefined),
    },
    ...overrides,
  };
}

describe('Home native-feel behavior', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
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
});
