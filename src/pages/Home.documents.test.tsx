import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HackDeskCommandPaletteCommand } from '@/lib/electron-api';
import { LAST_WORKSPACE_SCOPE_KEY } from './electron-home/ui-preferences';
import {
  useHomeTestLifecycle,
  note,
  document,
  folder,
  renderHome,
  findRenderedNoteTitle,
  editNote,
  renameNote,
  findNoteRow,
  openDocumentActions,
  acceptAppConfirmDialog,
  cancelAppConfirmDialog,
  createSafeSettings,
  createApi,
} from './Home.test-utils';

vi.setConfig({ testTimeout: 15_000 });

describe('Home window close, import, export and saving', () => {
  useHomeTestLifecycle();

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

  it('cancels the close request when closing with unsaved changes is rejected', async () => {
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
    await editNote();

    act(() => {
      closeHandler?.();
    });

    await screen.findByRole('alertdialog', { name: 'Close HackDesk with unsaved changes?' });
    await cancelAppConfirmDialog('Keep Editing');
    await waitFor(() => expect(api.app.cancelClose).toHaveBeenCalled());
    expect(api.app.confirmClose).not.toHaveBeenCalled();
  });

  it('confirms the close request after closing with unsaved changes is accepted', async () => {
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
    await editNote();

    act(() => {
      closeHandler?.();
    });

    await screen.findByRole('alertdialog', { name: 'Close HackDesk with unsaved changes?' });
    await acceptAppConfirmDialog('Close');
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
            content: noteId === 'note-design' ? '# Design Spec' : '# Product Plan',
          },
        })),
      },
      app: {
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle('Product Plan');
    await editNote();
    await screen.findByRole('status', { name: 'Sync state: Unsaved' });
    fireEvent.click(await findNoteRow('Design Spec'));
    await findRenderedNoteTitle('Design Spec');
    await editNote();
    await screen.findAllByText('Unsaved');

    act(() => {
      closeHandler?.();
    });

    const dialog = await screen.findByRole('alertdialog', { name: 'Close HackDesk with unsaved changes?' });
    expect(dialog).toHaveTextContent('2 notes have unsaved changes');
    await cancelAppConfirmDialog('Keep Editing');
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
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
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle('Product Plan');
    await editNote();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByLabelText('Sync state: Save failed');
    fireEvent.click(await findNoteRow('Design Spec'));
    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();

    act(() => {
      closeHandler?.();
    });

    const dialog = await screen.findByRole('alertdialog', { name: 'Close HackDesk with unsaved changes?' });
    expect(dialog).toHaveTextContent('1 note has a failed save');
    await cancelAppConfirmDialog('Keep Editing');
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
    fireEvent.click(within(screen.getByTestId('sidebar-footer')).getByRole('button', { name: 'Settings' }));
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
        onCloseRequest: vi.fn((handler) => {
          closeHandler = handler;
          return () => undefined;
        }),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    await editNote();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByLabelText('Sync state: Save failed');

    act(() => {
      closeHandler?.();
    });

    const dialog = await screen.findByRole('alertdialog', { name: 'Close HackDesk with unsaved changes?' });
    expect(dialog).toHaveTextContent('1 note has a failed save');
    await cancelAppConfirmDialog('Keep Editing');
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        createNote: vi.fn(async () => createdDocument),
        getNote: vi.fn(async () => ({ source: 'remote' as const, data: createdDocument })),
      },
    });

    renderHome(api);

    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);
    // ⌘N creates in the selected folder.
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    await editNote('# Folder note');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.hackmd.createNote).toHaveBeenCalledWith({
      title: 'Folder note',
      content: '# Folder note',
      parentFolderId: 'folder-1',
    }));
  });

  it('exports the current note as markdown with a safe file name', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        updateNote: vi.fn(async (_noteId, input) => ({ ...document, ...input })),
      },
    });

    renderHome(api);

    await findRenderedNoteTitle();
    await renameNote('Draft: Test note');
    await findRenderedNoteTitle('Draft: Test note');
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        createNote: vi.fn(async () => importedDocument),
        getNote: vi.fn(async () => ({ source: 'remote' as const, data: importedDocument })),
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
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
    await findRenderedNoteTitle();
    await renameNote('Renamed note');

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
          source: 'error' as const,
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

    await findRenderedNoteTitle();
    await editNote();
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
    await findRenderedNoteTitle();

    expect(screen.getByTestId('hackmd-markdown-editor')).toBeInTheDocument();
    // The header shows where the note lives, not an editable title.
    expect(screen.queryByRole('textbox', { name: 'Note title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'HackMD' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete note' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Note location' })).toHaveTextContent('My Workspace');
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
    await findRenderedNoteTitle();
    await editNote(' draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      title: 'Test note',
      content: '# Test note draft',
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
    await findRenderedNoteTitle();
    await editNote(' saved');
    fireEvent.keyDown(window, { key: 's', metaKey: true });

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      title: 'Test note',
      content: '# Test note saved',
    }));
    await waitFor(() => expect(screen.getByLabelText('Sync state: Saved')).toBeInTheDocument());
  });

  it('reconciles a Local Vault draft saved with the keyboard action', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({ type: 'local', label: 'Local Vault' }));
    const localDocument = {
      content: '# Test note',
      createdAtMillis: 1_700_000_000_000,
      id: 'local-note-1',
      parentPath: null,
      relativePath: 'Test note.md',
      revision: { contentHash: 'old-hash', mtimeMs: 1 },
      title: 'Test note',
      updatedAtMillis: 1_700_000_000_000,
    };
    const snapshot = {
      vaultId: 'vault-1',
      rootPath: '/tmp/vault',
      notes: [localDocument],
      folders: [],
    };
    const savedDocument = {
      ...localDocument,
      title: 'Keyboard note',
      relativePath: 'Keyboard note.md',
      revision: { contentHash: 'saved-hash', mtimeMs: 2 },
      updatedAtMillis: 1_700_000_000_001,
    };
    const savedSnapshot = {
      ...snapshot,
      notes: [savedDocument],
    };
    const writeNote = vi.fn(async () => ({ document: savedDocument, snapshot: savedSnapshot }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasHackmdApiToken: false,
          hackmdAccounts: { accounts: [], activeAccountId: null },
          hasLocalVault: true,
          localVault: { vaults: [{ id: 'vault-tmp', path: '/tmp/vault' }], activeVaultId: 'vault-tmp', workspaces: [], activeWorkspaceId: null },
        })),
      },
      localVault: {
        getSnapshot: vi.fn(async () => snapshot),
        readNote: vi.fn(async () => localDocument),
        writeNote,
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    await editNote(' saved');
    fireEvent.keyDown(window, { key: 's', metaKey: true });

    // An unchanged title is left out, so the file keeps its name.
    await waitFor(() => expect(writeNote).toHaveBeenCalledWith({
      noteId: 'local-note-1',
      content: '# Test note saved',
      expectedRevision: { contentHash: 'old-hash', mtimeMs: 1 },
    }));
    await waitFor(() => expect(screen.getByLabelText('Sync state: Saved')).toBeInTheDocument());
    expect(screen.queryByText('File changed on disk. Your draft is still open.')).not.toBeInTheDocument();
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

    expect(await findRenderedNoteTitle('Untitled')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: /^Untitled(?:, .+)?$/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('hackmd-markdown-editor')).toHaveTextContent('Captured');
    });
    expect(api.hackmd.createNote).not.toHaveBeenCalled();
    expect(api.app.resolveQuickCaptureSubmission).toHaveBeenCalledWith({
      requestId: 'capture-request',
      accepted: true,
    });
  });
});
