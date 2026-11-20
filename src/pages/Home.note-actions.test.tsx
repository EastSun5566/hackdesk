import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HackDeskCommandPaletteCommand } from '@/lib/electron-api';
import { ELECTRON_RECENT_NOTES_STORAGE_KEY } from '@/lib/electron-recent-notes';
import {
  useHomeTestLifecycle,
  note,
  document,
  folder,
  team,
  renderHome,
  findRenderedNoteTitle,
  findTeamWorkspace,
  confirmDeleteFolderDialog,
  createApi,
} from './Home.test-utils';

vi.setConfig({ testTimeout: 15_000 });

describe('Home note context menu actions', () => {
  useHomeTestLifecycle();

  it('moves a personal note to the selected folder from the note context menu', async () => {
    const movedDocument = {
      ...document,
      folderPaths: [folder],
    };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [{ ...note, folderPaths: [] }] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
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
    fireEvent.click(await screen.findByText('Move to…'));
    fireEvent.click(await screen.findByRole('option', { name: /Projects/ }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      parentFolderId: 'folder-1',
    }));
  });

  it('moves a personal note to root from the note context menu with null parentFolderId', async () => {
    const folderNote = { ...note, folderPaths: [folder] };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [folderNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        updateNote: vi.fn(async () => ({ ...document, folderPaths: [] })),
      },
    });

    const { container } = renderHome(api);
    fireEvent.click(await screen.findByTestId('tree-top-level'));
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Move to…'));
    fireEvent.click(await screen.findByRole('option', { name: /Root/ }));

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
          source: 'remote' as const,
          data: [{ ...note, title: 'A [Note]' }],
        })),
        getNote: vi.fn(async () => ({
          source: 'remote' as const,
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [{ ...note, folderPaths: [folder] }] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
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
    expect(await findRenderedNoteTitle('Copy of Test note')).toBeInTheDocument();
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
        listTeamNotes: vi.fn(async () => ({ source: 'remote' as const, data: [teamNote] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        getTeamFolderOrder: vi.fn(async () => ({ source: 'remote' as const, data: {} })),
        getNote: vi.fn(async () => ({ source: 'remote' as const, data: movedDocument })),
        updateTeamNote: vi.fn(async () => movedDocument),
      },
    });

    const { container } = renderHome(api);
    fireEvent.click(await findTeamWorkspace({ timeout: 5_000 }));
    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Move to…'));
    fireEvent.click(await screen.findByRole('option', { name: /Projects/ }));

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
        listTeamNotes: vi.fn(async () => ({ source: 'remote' as const, data: [teamNote] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        getTeamFolderOrder: vi.fn(async () => ({ source: 'remote' as const, data: {} })),
        getNote: vi.fn(async () => ({ source: 'remote' as const, data: movedDocument })),
        updateTeamNote: vi.fn(async () => movedDocument),
      },
    });

    const { container } = renderHome(api);
    fireEvent.click(await findTeamWorkspace({ timeout: 5_000 }));
    fireEvent.click(await screen.findByTestId('tree-top-level'));
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-1"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByText('Move to…'));
    fireEvent.click(await screen.findByRole('option', { name: /Root/ }));

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
        listTeamNotes: vi.fn(async () => ({ source: 'remote' as const, data: [teamNote] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        getTeamFolderOrder: vi.fn(async () => ({ source: 'remote' as const, data: {} })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
          data: noteId === 'team-copy' ? duplicated : teamDocument,
        })),
        createTeamNote: vi.fn(async () => duplicated),
      },
    });

    const { container } = renderHome(api);
    fireEvent.click(await findTeamWorkspace({ timeout: 5_000 }));
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
    expect(await findRenderedNoteTitle('Copy of Test note')).toBeInTheDocument();
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
        listTeamNotes: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
        createTeamNote: vi.fn(async () => importedDocument),
        getNote: vi.fn(async () => ({ source: 'remote' as const, data: importedDocument })),
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
    fireEvent.click(await findTeamWorkspace({ timeout: 5_000 }));
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

  it('deletes the selected folder after confirmation succeeds', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        deleteFolder: vi.fn(async () => undefined),
      },
      app: {
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
    await confirmDeleteFolderDialog();

    await waitFor(() => expect(api.hackmd.deleteFolder).toHaveBeenCalledWith('folder-1'));
  });
});
