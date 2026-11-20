import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useHomeTestLifecycle,
  note,
  document,
  folder,
  childFolder,
  renderHome,
  selectOption,
  findRenderedNoteTitle,
  editNote,
  queryNoteRow,
  getNoteRow,
  findNoteRow,
  openInspector,
  openNoteSettingsFromInspector,
  openDocumentActions,
  openCreateMenu,
  openViewOptions,
  findTagOption,
  openSearchScopeMenu,
  selectCurrentFolderScope,
  createApi,
} from './Home.test-utils';

vi.setConfig({ testTimeout: 15_000 });

describe('Home inspector, folders, tags and filters', () => {
  useHomeTestLifecycle();

  it('keeps the note inspector collapsed by default and toggles it from the editor header', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();

    expect(screen.queryByRole('heading', { name: 'Note Details' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand note details' })).toHaveAttribute('aria-expanded', 'false');

    await openInspector();

    expect(screen.getByRole('button', { name: 'Collapse note details' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse note details' }));
    // The details stay through the closing slide, then unmount.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Note Details' })).not.toBeInTheDocument());
  });

  it('exposes the sidebar expanded state on its titlebar toggle', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();

    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'note-navigator-panel');
    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button', { name: 'Expand sidebar' })).toHaveLength(1);
    expect(window.document.getElementById('note-navigator-panel')).toHaveStyle({ '--panel-width': '0px' });
  });

  it('starts folders collapsed and exposes expanded state as they open and close', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder, childFolder] })),
      },
    });

    renderHome(api);

    expect(await screen.findByRole('button', { name: 'Expand Projects' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Expand Projects' }));
    expect(screen.getByRole('button', { name: 'Collapse Projects' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Projects' }));
    expect(screen.getByRole('button', { name: 'Expand Projects' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('updates note metadata from Note Settings opened via the inspector', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        updateNote: vi.fn(async (_noteId, input) => ({
          ...document,
          description: input.description ?? document.description,
          tags: input.tags ?? document.tags,
        })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    const dialog = await openNoteSettingsFromInspector();

    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Updated metadata' } });
    const tagInput = within(dialog).getByLabelText('Tags');
    fireEvent.change(tagInput, { target: { value: 'desktop' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      description: 'Updated metadata',
      tags: ['desktop'],
    }));
  });

  it('opens the share dialog from the inspector header and copies a HackMD link', async () => {
    const api = createApi();

    renderHome(api);
    await findRenderedNoteTitle();
    await openInspector();
    fireEvent.click(screen.getByRole('button', { name: 'Share note' }));

    const dialog = await screen.findByRole('dialog', { name: 'Share Note' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy HackMD link' }));

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
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Read access' })).getByRole('radio', { name: 'Signed in' }));
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Write access' })).getByRole('radio', { name: 'Signed in' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      readPermission: 'signed_in',
      writePermission: 'signed_in',
    }));
  });

  it('moves a note to a selected folder from Note Settings', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        updateNote: vi.fn(async (_noteId, input) => ({
          ...document,
          folderPaths: input.parentFolderId ? [folder] : document.folderPaths,
        })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    const dialog = await openNoteSettingsFromInspector();

    await selectOption('Folder', 'Projects', dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => expect(api.hackmd.updateNote).toHaveBeenCalledWith('note-1', {
      parentFolderId: 'folder-1',
    }));
  });

  it('moves a note to root from Note Settings with null parentFolderId', async () => {
    const folderNote = { ...note, folderPaths: [folder] };
    const folderDocument = { ...document, folderPaths: [folder] };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [folderNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        getNote: vi.fn(async () => ({ source: 'remote' as const, data: folderDocument })),
        updateNote: vi.fn(async () => ({ ...folderDocument, folderPaths: [] })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    const dialog = await openNoteSettingsFromInspector();

    await selectOption('Folder', 'Root', dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Settings' }));

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
    await openCreateMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /New Folder/ }));
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
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folderWithMetadata] })),
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [firstNote, secondNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-second' ? 'Second note' : 'First note',
          },
        })),
      },
    });

    const { container } = renderHome(api);
    expect(await findRenderedNoteTitle('First note')).toBeInTheDocument();
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-second"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });

    expect(within(row).getByRole('button', { name: 'Drag Second note' })).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('treeitem', { name: 'Second note' }));

    expect(await findRenderedNoteTitle('Second note')).toBeInTheDocument();
  });

  it('selects a note when clicking its drag handle without starting a drag', async () => {
    const firstNote = { ...note, id: 'note-first', title: 'First note', shortId: 'first', updatedAtMillis: 3000 };
    const secondNote = { ...note, id: 'note-second', title: 'Second note', shortId: 'second', updatedAtMillis: 2000 };
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [firstNote, secondNote] })),
        getNote: vi.fn(async (noteId: string) => ({
          source: 'remote' as const,
          data: {
            ...document,
            id: noteId,
            title: noteId === 'note-second' ? 'Second note' : 'First note',
          },
        })),
      },
    });

    const { container } = renderHome(api);
    expect(await findRenderedNoteTitle('First note')).toBeInTheDocument();
    const row = await waitFor(() => {
      const noteRow = container.querySelector('[data-note-id="note-second"]');
      expect(noteRow).toBeTruthy();
      return noteRow as HTMLElement;
    });

    fireEvent.click(within(row).getByRole('button', { name: 'Drag Second note' }));

    expect(await findRenderedNoteTitle('Second note')).toBeInTheDocument();
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
      },
    });

    renderHome(api);
    await findNoteRow('Product Plan');
    await openViewOptions();
    fireEvent.click(await findTagOption('product'));

    await screen.findByText('1 result');
    expect(getNoteRow('Product Plan')).toBeInTheDocument();
    expect(queryNoteRow('Design Spec')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag filter product' }));

    await findNoteRow('Design Spec');
    expect(screen.queryByText('1 result')).not.toBeInTheDocument();
  });

  it('filters notes from View options and clears the active tag when clicked again', async () => {
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
    await openViewOptions();
    fireEvent.click(await findTagOption('product'));

    await screen.findByText('1 result');
    expect(getNoteRow('Product Plan')).toBeInTheDocument();
    expect(queryNoteRow('Design Spec')).not.toBeInTheDocument();
    expect(await findTagOption('product')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(await findTagOption('product'));

    await findNoteRow('Design Spec');
    expect(screen.queryByText('1 result')).not.toBeInTheDocument();
  });

  it('shows multi-tag state in filter chips and View options', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], updatedAtMillis: 2000 },
      { ...note, id: 'note-ops', title: 'Ops Runbook', shortId: 'ops', tags: ['ops'], updatedAtMillis: 1000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
      },
    });

    renderHome(api);
    await findNoteRow('Product Plan');
    await openViewOptions();
    fireEvent.click(await findTagOption('product'));
    fireEvent.click(await findTagOption('design'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove tag filter product', hidden: true })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Remove tag filter design', hidden: true })).toBeInTheDocument();
    expect(await findTagOption('product')).toHaveAttribute('aria-checked', 'true');
    expect(await findTagOption('design')).toHaveAttribute('aria-checked', 'true');
    expect(await findTagOption('ops')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: /^View options/ })).toHaveTextContent('2');
  });

  it('lists every tag in View options', async () => {
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
      },
    });

    renderHome(api);
    await findNoteRow('Note 1');
    await openViewOptions();
    expect(await findTagOption('tag-01')).toBeInTheDocument();
    expect(await findTagOption('tag-13')).toBeInTheDocument();
  });

  it('filters by tag in history scope', async () => {
    const historyNotes = [
      { ...note, id: 'history-product', title: 'History Product', shortId: 'history-product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'history-design', title: 'History Design', shortId: 'history-design', tags: ['design'], updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listHistory: vi.fn(async () => ({ source: 'remote' as const, data: historyNotes })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.click(await screen.findByRole('button', { name: 'History' }));
    await findNoteRow('History Product');
    // History is a flat list, most recent first, not a folder tree.
    expect(screen.queryByTestId('folder-navigator-tree')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Recently opened notes' })).toBeInTheDocument();
    await openViewOptions();
    fireEvent.click(await findTagOption('product'));

    await waitFor(() => expect(queryNoteRow('History Design')).not.toBeInTheDocument());
    expect(getNoteRow('History Product')).toBeInTheDocument();
  });

  it('removes a History row from History without deleting the note', async () => {
    const historyNotes = [
      { ...note, id: 'history-kept', title: 'History Kept', shortId: 'history-kept', updatedAtMillis: 3000 },
      { ...note, id: 'history-removed', title: 'History Removed', shortId: 'history-removed', updatedAtMillis: 2000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listHistory: vi.fn(async () => ({ source: 'remote' as const, data: historyNotes })),
      },
    });

    renderHome(api);
    await findRenderedNoteTitle();
    fireEvent.click(await screen.findByRole('button', { name: 'History' }));
    fireEvent.contextMenu(await findNoteRow('History Removed'));
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from History' }));

    await waitFor(() => expect(queryNoteRow('History Removed')).not.toBeInTheDocument());
    expect(getNoteRow('History Kept')).toBeInTheDocument();
    expect(api.hackmd.deleteNote).not.toHaveBeenCalled();
  });

  it('sorts the tree\'s notes by title without leaving the tree', async () => {
    const notes = [
      { ...note, id: 'note-b', title: 'Beta', shortId: 'beta', updatedAtMillis: 3000 },
      { ...note, id: 'note-a', title: 'Alpha', shortId: 'alpha', updatedAtMillis: 1000 },
    ];
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: notes })),
      },
    });

    renderHome(api);
    await findNoteRow('Beta');
    await openViewOptions();
    fireEvent.click(await screen.findByText('Title A-Z'));

    await waitFor(() => {
      // Sorting reorders the tree's notes and keeps the tree: no result list replaces it.
      expect([...screen.getByRole('tree').querySelectorAll('[data-note-id]')].map((row) => row.getAttribute('data-note-id'))).toEqual([
        'note-a',
        'note-b',
      ]);
    });
    expect(screen.queryByLabelText('Search results')).not.toBeInTheDocument();
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
        listNotes: vi.fn(async () => ({ source: 'remote' as const, data: [folderNote, childNote, rootNote] })),
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder, childFolder] })),
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
    // The scope narrows a search; on its own it leaves the tree.
    fireEvent.change(screen.getByRole('textbox', { name: 'Search notes' }), { target: { value: 'Note' } });

    await screen.findByText('1 result');
    expect(getNoteRow('Folder Note')).toBeInTheDocument();
    expect(queryNoteRow('Child Note')).not.toBeInTheDocument();
    expect(queryNoteRow('Root Note')).not.toBeInTheDocument();
  });

  it('clears finder query and filters with Escape without changing editor input', async () => {
    const notes = [
      { ...note, id: 'note-product', title: 'Product Plan', shortId: 'product', tags: ['product'], updatedAtMillis: 3000 },
      { ...note, id: 'note-design', title: 'Design Spec', shortId: 'design', tags: ['design'], updatedAtMillis: 2000 },
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
    await findRenderedNoteTitle('Product Plan');
    fireEvent.change(screen.getByPlaceholderText('Search notes'), { target: { value: 'Product' } });
    await openViewOptions();
    fireEvent.click(await findTagOption('product'));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    // Escape inside the note stays with the editor.
    await editNote(' draft');
    const content = screen.getByTestId('hackmd-markdown-editor').querySelector<HTMLElement>('.cm-content')!;
    fireEvent.keyDown(content, { key: 'Escape' });

    expect(content).toHaveTextContent('draft');
    expect(screen.getByPlaceholderText('Search notes')).toHaveValue('Product');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByPlaceholderText('Search notes')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Remove tag filter product' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Remove tag filter product' })).not.toBeInTheDocument();
  });
});
