import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, HackDeskElectronAPI, NoteSummary } from '@/lib/electron-api';
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

function createApi(overrides: Partial<HackDeskElectronAPI> = {}): HackDeskElectronAPI {
  return {
    getRuntimeEnvironment: () => 'electron',
    settings: {
      get: vi.fn(async () => ({ title: 'HackDesk', hasHackmdApiToken: true })),
      update: vi.fn(),
    },
    hackmd: {
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

    await screen.findByDisplayValue('Test note');
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

    await screen.findByDisplayValue('Test note');
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));

    await waitFor(() => expect(api.hackmd.deleteNote).toHaveBeenCalledWith('note-1'));
  });

  it('closes transient panels with Escape', async () => {
    const api = createApi();

    renderHome(api);

    await screen.findByDisplayValue('Test note');
    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));
    expect(screen.getByRole('heading', { name: 'New Note' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'New Note' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });
});
