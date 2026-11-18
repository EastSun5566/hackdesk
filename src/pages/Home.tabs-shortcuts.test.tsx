import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/ui/toast';
import type { DocumentSummary, HackDeskCommandPaletteCommand } from '@/lib/electron-api';
import {
  useHomeTestLifecycle,
  note,
  document,
  folder,
  renderHome,
  findRenderedNoteTitle,
  queryRenderedNoteTitle,
  editNote,
  renameNote,
  createDeferred,
  getNoteRow,
  findNoteRow,
  openWorkspaceSwitcher,
  confirmDeleteNoteDialog,
  cancelAppConfirmDialog,
  createApi,
} from './Home.test-utils';

vi.setConfig({ testTimeout: 15_000 });

describe('Home command palette, tabs and shortcuts', () => {
  useHomeTestLifecycle();

  it('shows disabled command palette actions with concrete reasons', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'p', metaKey: true, shiftKey: true });

    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument();
    expect(screen.getAllByText('Select a folder first.').length).toBeGreaterThan(0);
    expect(screen.getByText('No unsaved note changes.')).toBeInTheDocument();
  });

  it('saves Settings without closing the dialog and without refreshing unrelated HackMD data', async () => {
    const api = createApi();
    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.click(within(screen.getByTestId('sidebar-footer')).getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Window title'), { target: { value: 'My HackDesk' } });
    await waitFor(() => expect(api.settings.update).toHaveBeenCalledWith({ title: 'My HackDesk' }));
    // Every change saves at once; Settings stays open.
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument());
    expect(api.hackmd.listNotes).toHaveBeenCalledOnce();
    expect(api.hackmd.getCurrentUser).toHaveBeenCalledOnce();
  });

  it('switches the global editor mode from the command palette without refreshing HackMD', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and commands…'), {
      target: { value: 'vim editor mode' },
    });
    fireEvent.click(await within(palette).findByRole('option', { name: /^Use Vim Editor Mode/ }));

    await waitFor(() => expect(api.settings.update).toHaveBeenCalledWith({
      title: 'HackDesk',
      editor: { mode: 'vim' },
    }));
    await waitFor(() => expect(window.document.querySelector('.cm-editor')).toHaveAttribute('data-editor-mode', 'vim'));
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
    expect(api.hackmd.listNotes).toHaveBeenCalledOnce();
    expect(api.hackmd.getCurrentUser).toHaveBeenCalledOnce();
  });

  it('quick-opens a matching note with Cmd+P', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 1000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], folderPaths: [folder], updatedAtMillis: 3000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
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
    });

    renderHome(api);
    await findNoteRow('Product Plan', { timeout: 5_000 });
    fireEvent.keyDown(window, { key: 'p', metaKey: true });

    const palette = await screen.findByRole('dialog', { name: 'Quick Open' });
    fireEvent.change(within(palette).getByPlaceholderText('Search notes, folders, and workspaces…'), { target: { value: 'design' } });
    fireEvent.click(await within(palette).findByRole('option', { name: /^Design Spec/ }));

    expect(screen.queryByRole('dialog', { name: 'Quick Open' })).not.toBeInTheDocument();
    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
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
    expect(await findRenderedNoteTitle('Product Plan')).toBeInTheDocument();
    fireEvent.click(await findNoteRow('Design Spec'));

    expect(queryRenderedNoteTitle('Product Plan')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status', { name: 'Loading note' }).length).toBeGreaterThan(0);

    await act(async () => {
      secondNoteDeferred.resolve({
        source: 'remote' as const,
        data: { ...document, id: 'note-design', title: 'Design Spec', content: '# Design Spec' },
      });
    });

    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();
  });

  it('opens another note in a tab without discarding the dirty current tab', async () => {
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
    fireEvent.click(await findNoteRow('Design Spec'));

    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();
    expect(api.app.confirm).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('tab', { name: /^Product Plan(?:, .+)?$/ }));
    expect(await findRenderedNoteTitle('Product Plan')).toBeInTheDocument();
  });

  it('focuses an existing tab when the same note is selected again', async () => {
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
        confirm: vi.fn(async () => ({ confirmed: true })),
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError: vi.fn(async () => undefined),
        onCommand: vi.fn(() => () => undefined),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle('Product Plan');
    await editNote();
    await screen.findByRole('status', { name: 'Sync state: Unsaved' });
    fireEvent.click(await findNoteRow('Design Spec'));
    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();
    fireEvent.click(await findNoteRow('Product Plan'));

    expect(await findRenderedNoteTitle('Product Plan')).toBeInTheDocument();
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
    });

    renderHome(api);
    await findRenderedNoteTitle('Product Plan');
    fireEvent.click(await findNoteRow('Design Spec'));
    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'w', metaKey: true });

    expect(await findRenderedNoteTitle('Product Plan')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Design Spec(?:, .+)?$/ })).not.toBeInTheDocument();
    expect(api.app.confirm).not.toHaveBeenCalled();
  });

  it('keeps the empty workbench open after Cmd+W closes the last clean tab', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();

    fireEvent.keyDown(window, { key: 'w', metaKey: true });

    expect(api.app.cancelClose).not.toHaveBeenCalled();
    expect(api.app.confirmClose).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'No note selected' })).toBeInTheDocument();
  });

  it('keeps a dirty tab open when Cmd+W discard is cancelled', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    await editNote();
    await screen.findByRole('status', { name: 'Sync state: Unsaved' });

    fireEvent.keyDown(window, { key: 'w', metaKey: true });

    await screen.findByRole('alertdialog', { name: 'Close “Test note”?' });
    await cancelAppConfirmDialog('Keep Editing');
    expect(screen.getByRole('tab', { name: /^Test note(?:, .+)?$/ })).toBeInTheDocument();
  });

  it('splits the active note into a second editor pane', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();

    fireEvent.keyDown(window, { key: '\\', metaKey: true });

    expect(await screen.findAllByRole('tab', { name: /^Test note(?:, .+)?$/ })).toHaveLength(2);
    expect(screen.getAllByText('Test note').length).toBeGreaterThan(1);
  });

  it('opens a blank tab with Cmd+T by default', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 't', metaKey: true });

    expect(await screen.findByRole('tab', { name: 'New Tab' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: /^Test note(?:, .+)?$/ })).toHaveLength(1);
  });

  it('opens a duplicate active note tab with Cmd+T when configured', async () => {
    window.localStorage.setItem('hackdesk_new_tab_opens', 'duplicate');
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    await editNote();
    fireEvent.keyDown(window, { key: 't', metaKey: true });

    expect(await screen.findAllByRole('tab', { name: /^Test note(?:, .+)?$/ })).toHaveLength(2);
  });

  it('previews notes picked in the sidebar in one tab until one is kept', async () => {
    const notes = [
      { ...note, id: 'note-a', title: 'Alpha', shortId: 'alpha', updatedAtMillis: 3000 },
      { ...note, id: 'note-b', title: 'Beta', shortId: 'beta', updatedAtMillis: 2000 },
      { ...note, id: 'note-c', title: 'Gamma', shortId: 'gamma', updatedAtMillis: 1000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
          data: { ...document, id: noteId, title: notes.find((candidate) => candidate.id === noteId)!.title, content: `# ${noteId}` },
        })),
      },
    });
    const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'));

    renderHome(api);
    await findRenderedNoteTitle('Alpha');
    fireEvent.click(await findNoteRow('Beta'));
    await findRenderedNoteTitle('Beta');
    // The note shown on launch is a tab of its own; a sidebar pick is a preview.
    await waitFor(() => expect(tabNames()).toEqual(['Alpha', 'Beta, preview']));
    fireEvent.click(await findNoteRow('Gamma'));
    await findRenderedNoteTitle('Gamma');
    // Gamma took Beta's preview tab instead of opening another.
    await waitFor(() => expect(tabNames()).toEqual(['Alpha', 'Gamma, preview']));

    // Double-clicking the note in the sidebar keeps its tab; the next pick opens a new preview.
    fireEvent.doubleClick(await findNoteRow('Gamma'));
    await waitFor(() => expect(tabNames()).toEqual(['Alpha', 'Gamma']));
    fireEvent.click(await findNoteRow('Beta'));
    await findRenderedNoteTitle('Beta');
    await waitFor(() => expect(tabNames()).toEqual(['Alpha', 'Gamma', 'Beta, preview']));
  });

  it('focuses note tabs with next and previous shortcuts', async () => {
    const notes = [
      { ...note, id: 'note-a', title: 'Alpha', shortId: 'alpha', updatedAtMillis: 3000 },
      { ...note, id: 'note-b', title: 'Beta', shortId: 'beta', updatedAtMillis: 2000 },
      { ...note, id: 'note-c', title: 'Gamma', shortId: 'gamma', updatedAtMillis: 1000 },
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
            title: noteId === 'note-a' ? 'Alpha' : noteId === 'note-b' ? 'Beta' : 'Gamma',
            content: `# ${noteId}`,
          },
        })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle('Alpha');
    // A click only previews a note; double-clicking keeps each in a tab of its own.
    const keep = async (title: string) => {
      const row = await findNoteRow(title);
      fireEvent.click(row);
      fireEvent.doubleClick(row);
    };
    await keep('Beta');
    await findRenderedNoteTitle('Beta');
    await keep('Gamma');
    await findRenderedNoteTitle('Gamma');

    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true, altKey: true });
    expect(await findRenderedNoteTitle('Alpha')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true, altKey: true });
    expect(await findRenderedNoteTitle('Beta')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft', metaKey: true, altKey: true });
    expect(await findRenderedNoteTitle('Alpha')).toBeInTheDocument();
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
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
    await findRenderedNoteTitle('Alpha');
    fireEvent.click(await findNoteRow('Beta'));
    await findRenderedNoteTitle('Beta');
    fireEvent.click(await findNoteRow('Gamma'));
    await findRenderedNoteTitle('Gamma');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await findRenderedNoteTitle('Beta')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: ']', metaKey: true });
    expect(await findRenderedNoteTitle('Gamma')).toBeInTheDocument();
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

    await waitFor(() => expect(getNoteRow('Test note')).toHaveFocus());
  });

  it('focuses the editor body after selecting a note from the navigator', async () => {
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
    });

    renderHome(api);
    await findRenderedNoteTitle('Product Plan');
    fireEvent.click(await findNoteRow('Design Spec'));

    await waitFor(() => {
      const editorContent = screen.getByTestId('hackmd-markdown-editor').querySelector('.cm-content');
      expect(editorContent).toHaveFocus();
    });
  });

  it('leaves macOS Ctrl+F available for editor text navigation', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    const search = screen.getByRole('textbox', { name: 'Search notes' });
    search.focus();
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    expect(search).toHaveFocus();
  });

  it('toggles the sidebar with Cmd+B, and Cmd+Option+B no longer does', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: 'b', altKey: true, metaKey: true });
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(window, { key: 'b', metaKey: true });

    expect(await screen.findByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
    expect(window.document.getElementById('note-navigator-panel')).toHaveStyle({ '--panel-width': '0px' });
  });

  it('enters and leaves Hack Mode with Cmd+., and Cmd+B leaves it with the sidebar shown', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    const chrome = () => window.document.querySelector('.app-chrome')!;
    expect(chrome()).not.toHaveAttribute('data-hack-mode');

    const info = vi.spyOn(toast, 'info');
    fireEvent.keyDown(window, { key: '.', metaKey: true });
    expect(chrome()).toHaveAttribute('data-hack-mode', 'true');
    expect(info).toHaveBeenCalledWith('Hack Mode · Press ⌘. to leave');
    info.mockRestore();
    fireEvent.keyDown(window, { key: '.', metaKey: true });
    expect(chrome()).not.toHaveAttribute('data-hack-mode');

    fireEvent.keyDown(window, { key: '.', metaKey: true });
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(chrome()).not.toHaveAttribute('data-hack-mode');
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('names the sidebar landmark and does not reopen the switcher after hiding the sidebar with it open', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveAttribute('id', 'note-navigator-panel');
    await openWorkspaceSwitcher();

    // The native menu still toggles while the list is open; the titlebar button takes the same path.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Expand sidebar' }));

    expect(await screen.findByRole('button', { name: /^Switch workspace, current: / })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Workspaces' })).toBeNull();
  });

  it('leaves macOS Ctrl+B available for editor text navigation', async () => {
    const api = createApi();

    renderHome(api);
    expect(await screen.findByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
  });

  it('renames the note from its More actions and shows the new title in the tab', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        updateNote: vi.fn(async (_noteId, input) => ({ ...document, ...input })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    await renameNote('Renamed title');

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', { title: 'Renamed title', content: '# Test note' }));
    expect(await findRenderedNoteTitle('Renamed title')).toBeInTheDocument();
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
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
    await findRenderedNoteTitle('Alpha');
    fireEvent.click(await findNoteRow('Beta'));
    await findRenderedNoteTitle('Beta');
    fireEvent.click(await findNoteRow('Gamma'));
    await findRenderedNoteTitle('Gamma');
    fireEvent.click(await screen.findByRole('tab', { name: /^Alpha(?:, .+)?$/ }));

    act(() => {
      commandHandler?.({ type: 'close-tabs-to-right' });
    });

    await waitFor(() => expect(screen.queryByRole('tab', { name: /^Beta(?:, .+)?$/ })).not.toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: /^Gamma(?:, .+)?$/ })).not.toBeInTheDocument();

    act(() => {
      commandHandler?.({ type: 'reopen-last-closed-tab' });
    });

    expect(await screen.findByRole('tab', { name: /^Gamma(?:, .+)?$/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Beta(?:, .+)?$/ })).not.toBeInTheDocument();
  });

  it('restores note tabs after remounting the same workspace scope', async () => {
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
    });

    renderHome(api);
    await findRenderedNoteTitle('Product Plan');
    fireEvent.click(await findNoteRow('Design Spec'));
    await findRenderedNoteTitle('Design Spec');
    await waitFor(() => expect(Array.from({ length: window.localStorage.length }, (_value, index) => {
      const key = window.localStorage.key(index);
      return key?.startsWith('hackdesk_note_workspace:personal')
        ? window.localStorage.getItem(key)?.includes('note-design')
        : false;
    }).some(Boolean)).toBe(true));

    cleanup();
    renderHome(api);

    expect(await screen.findByRole('tab', { name: /^Product Plan(?:, .+)?$/ })).toBeInTheDocument();
    expect(await findRenderedNoteTitle('Design Spec')).toBeInTheDocument();
  });

  it('closes duplicated matching tabs after deleting a note', async () => {
    let commandHandler: ((command: HackDeskCommandPaletteCommand) => void) | null = null;
    let notes = [note];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
        deleteNote: vi.fn(async (noteId: string) => {
          notes = notes.filter((candidate) => candidate.id !== noteId);
        }),
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
    await findRenderedNoteTitle();
    fireEvent.keyDown(window, { key: '\\', metaKey: true, shiftKey: true });
    expect(await screen.findAllByRole('tab', { name: /^Test note(?:, .+)?$/ })).toHaveLength(2);
    expect(screen.getAllByText('Test note').length).toBeGreaterThan(1);
    act(() => {
      commandHandler?.({ type: 'delete-note' });
    });
    await confirmDeleteNoteDialog();

    await waitFor(() => expect(api.hackmd.deleteNote).toHaveBeenCalledWith('note-1'));
    await waitFor(() => expect(screen.queryByRole('tab', { name: /^Test note(?:, .+)?$/ })).not.toBeInTheDocument());
  });
});
