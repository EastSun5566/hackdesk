import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ELECTRON_RECENT_NOTES_STORAGE_KEY } from '@/lib/electron-recent-notes';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { LOCAL_VAULT_TEAM_PATH } from './electron-home/local-vault-adapter';
import { LAST_WORKSPACE_SCOPE_KEY } from './electron-home/ui-preferences';
import {
  useHomeTestLifecycle,
  note,
  document,
  folder,
  team,
  renderHome,
  findRenderedNoteTitle,
  editNote,
  queryNoteRow,
  getNoteRow,
  findNoteRow,
  selectCurrentFolderScope,
  createSafeSettings,
  createApi,
} from './Home.test-utils';

vi.setConfig({ testTimeout: 15_000 });

describe('Home quick open, recent notes and workspace switching', () => {
  useHomeTestLifecycle();

  it('does not auto-select a folder note over a dirty current tab', async () => {
    const rootNote = { ...note, id: 'root-note', title: 'Root Note', shortId: 'root-note', folderPaths: [], updatedAtMillis: 3000 };
    const folderNote = { ...note, id: 'folder-note', title: 'Folder Note', shortId: 'folder-note', folderPaths: [folder], updatedAtMillis: 2000 };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [rootNote, folderNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
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
    await findRenderedNoteTitle('Root Note');
    await editNote();
    await screen.findByRole('status', { name: 'Sync state: Unsaved' });
    fireEvent.click((await screen.findAllByText('Projects'))[0].closest('button')!);

    expect(api.app.confirm).not.toHaveBeenCalled();
    expect((await findRenderedNoteTitle('Root Note'))).toBeInTheDocument();
  });

  it('quick-opens another note without discarding a dirty current tab', async () => {
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
        confirm: vi.fn(async () => ({ confirmed: false })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle('Product Plan');
    await editNote();
    await screen.findByRole('status', { name: 'Sync state: Unsaved' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'design' } });
    fireEvent.click(await within(palette).findByRole('option', { name: /^Design Spec/ }));

    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();
    expect(api.app.confirm).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('tab', { name: /^Product Plan(?:, .+)?$/ }));
    expect(await findRenderedNoteTitle('Product Plan')).toBeInTheDocument();
  });

  it('quick-opens a folder from the command palette', async () => {
    const folderNote = { ...note, id: 'folder-note', title: 'Folder Note', shortId: 'folder-note', folderPaths: [folder] };
    const rootNote = { ...note, id: 'root-note', title: 'Root Note', shortId: 'root-note', folderPaths: [] };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [folderNote, rootNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
      },
    });

    renderHome(api);
    await findNoteRow('Folder Note');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'Projects' } });
    fireEvent.click(await within(palette).findByRole('option', { name: /^Projects/ }));

    await selectCurrentFolderScope();
    // The scope narrows a search; on its own it leaves the tree.
    fireEvent.change(screen.getByRole('textbox', { name: 'Search notes' }), { target: { value: 'Note' } });

    await screen.findByText('1 result');
    expect(getNoteRow('Folder Note')).toBeInTheDocument();
    expect(queryNoteRow('Root Note')).not.toBeInTheDocument();
  });

  it('quick-opens the Root folder from the command palette', async () => {
    const folderNote = { ...note, id: 'folder-note', title: 'Folder Note', shortId: 'folder-note', folderPaths: [folder] };
    const rootNote = { ...note, id: 'root-note', title: 'Root Note', shortId: 'root-note', folderPaths: [] };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [folderNote, rootNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
      },
    });

    renderHome(api);
    await findNoteRow('Root Note');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'Root' } });
    const folders = await within(palette).findByRole('group', { name: 'Folders' });
    fireEvent.click(within(folders).getByRole('option', { name: /^Root/ }));

    await selectCurrentFolderScope();
    // The scope narrows a search; on its own it leaves the tree.
    fireEvent.change(screen.getByRole('textbox', { name: 'Search notes' }), { target: { value: 'Note' } });

    await screen.findByText('1 result');
    expect(getNoteRow('Root Note')).toBeInTheDocument();
    expect(queryNoteRow('Folder Note')).not.toBeInTheDocument();
  });

  it('applies the command palette query to Note Finder results', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
      },
    });

    renderHome(api);
    await findNoteRow('Product Plan');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'Design' } });
    fireEvent.click(await within(palette).findByText('Show Finder Results for “Design”'));

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search notes')).toHaveValue('Design');
    await screen.findByText('1 result');
    expect(getNoteRow('Design Spec')).toBeInTheDocument();
    expect(queryNoteRow('Product Plan')).not.toBeInTheDocument();
  });

  it('records selected notes and shows them in command palette recent notes', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
      },
    });

    renderHome(api);
    fireEvent.click(await findNoteRow('Product Plan', { timeout: 5_000 }));

    expect(JSON.parse(window.localStorage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY) ?? '[]')[0]).toMatchObject({
      noteId: 'note-product',
      title: 'Product Plan',
      shortId: 'product',
      teamPath: null,
    });

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });

    expect(within(palette).getByText('Recent notes')).toBeInTheDocument();
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-design' ? 'Design Spec' : 'Product Plan',
          },
        })),
      },
    });

    renderHome(api);
    await findNoteRow('Product Plan', { timeout: 5_000 });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    const recentGroup = within(palette).getByText('Recent notes').closest('[cmdk-group]')!;
    fireEvent.click(within(recentGroup as HTMLElement).getByRole('option', { name: /Design Spec/ }));

    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();
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
        confirm: vi.fn(async () => ({ confirmed: false })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle('Product Plan');
    await editNote();
    await screen.findByRole('status', { name: 'Sync state: Unsaved' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.click(within(palette).getAllByText('Design Spec')[0]);

    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();
    expect(api.app.confirm).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('tab', { name: /^Product Plan(?:, .+)?$/ }));
    expect(await findRenderedNoteTitle('Product Plan')).toBeInTheDocument();
  });

  it('waits for the Local Vault identity before showing and restoring a legacy local recent note', async () => {
    window.localStorage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify([{
      noteId: 'local-note',
      teamPath: LOCAL_VAULT_TEAM_PATH,
      title: 'Local Recent',
      shortId: 'Local Recent.md',
      lastOpenedAtMillis: 3000,
    }]));
    const localNote = {
      id: 'local-note',
      title: 'Local Recent',
      relativePath: 'Local Recent.md',
      parentPath: null,
      createdAtMillis: 1,
      updatedAtMillis: 2,
      revision: { contentHash: 'local-hash', mtimeMs: 2 },
    };
    const snapshot: LocalVaultSnapshot = {
      vaultId: 'vault-1',
      rootPath: '/tmp/vault',
      folders: [],
      notes: [localNote],
    };
    let resolveSnapshot!: (snapshot: LocalVaultSnapshot) => void;
    const snapshotPromise = new Promise<LocalVaultSnapshot>((resolve) => {
      resolveSnapshot = resolve;
    });
    const getSnapshot = vi.fn(() => snapshotPromise);
    const readNote = vi.fn(async () => ({ ...localNote, content: '# Local Recent' }));
    const api = createApi({
      settings: {
        get: vi.fn(async () => createSafeSettings({
          hasLocalVault: true,
          localVault: { vaults: [{ id: 'vault-tmp', path: '/tmp/vault' }], activeVaultId: 'vault-tmp', workspaces: [], activeWorkspaceId: null },
        })),
      },
      localVault: { getSnapshot, readNote },
    });

    renderHome(api);
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledOnce());
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    expect(within(palette).queryByText('Local Recent')).not.toBeInTheDocument();

    expect(JSON.parse(window.localStorage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY) ?? '[]')).toEqual([
      expect.objectContaining({ noteId: 'local-note', teamPath: LOCAL_VAULT_TEAM_PATH }),
    ]);
    expect(api.hackmd.listTeamNotes).not.toHaveBeenCalledWith(LOCAL_VAULT_TEAM_PATH);
    expect(readNote).not.toHaveBeenCalled();

    await act(async () => {
      resolveSnapshot(snapshot);
      await snapshotPromise;
    });

    fireEvent.click(await within(palette).findByText('Local Recent'));
    expect(await findRenderedNoteTitle('Local Recent')).toBeInTheDocument();
    expect(readNote).toHaveBeenCalledWith('local-note');
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
        listTeamNotes: vi.fn(async () => ({ source: 'remote' as const, data: [{
          ...note,
          id: 'team-note',
          title: 'Team Recent',
          shortId: 'team-note',
          teamPath: team.path,
          userPath: null,
        }] })),
        listTeamFolders: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
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
    await findNoteRow('Test note', { timeout: 5_000 });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.click(within(palette).getByText('Team Recent'));

    await waitFor(() => expect(api.hackmd.listTeamNotes).toHaveBeenCalledWith('team-workspace'));
    expect(await findRenderedNoteTitle('Team Recent')).toBeInTheDocument();
  });

  it('switches workspaces from command palette workspace results', async () => {
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
      },
    });

    renderHome(api);
    await findNoteRow('Test note', { timeout: 5_000 });
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
        listHistory: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), { target: { value: 'history' } });
    fireEvent.click(await within(palette).findByRole('option', { name: /^Go to History/ }));

    await waitFor(() => expect(api.hackmd.listHistory).toHaveBeenCalledWith(40));
    expect(await screen.findByText('No matching recent notes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch workspace, current: My Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to notes' })).toBeInTheDocument();
  });

  it('restores the last active history workspace on startup', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({ type: 'history', label: 'History' }));
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listHistory: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
      },
    });

    renderHome(api);

    await waitFor(() => expect(api.hackmd.listHistory).toHaveBeenCalledWith(40));
    expect(await screen.findByText('No history yet')).toBeInTheDocument();
  });
});
