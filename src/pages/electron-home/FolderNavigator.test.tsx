import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';
import type { FolderPathSummary, NoteSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  expectDisabledToolbarAction,
  expectMenuReturnsFocus,
  expectToolbarRovingFocus,
} from '@/test/accessibility-contracts';

import { FolderNavigator, type FolderNavigatorProps } from './FolderNavigator';
import { formatDate } from './ui';

function folder(input: Partial<FolderPathSummary> & Pick<FolderPathSummary, 'id' | 'name'>): FolderPathSummary {
  return {
    clientId: input.clientId ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    id: input.id,
    name: input.name,
    parentId: input.parentId ?? null,
  };
}

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    content: input.content ?? null,
    createdAtMillis: input.createdAtMillis ?? null,
    description: input.description ?? '',
    folderPaths: input.folderPaths ?? [],
    id: input.id,
    lastChangeUser: input.lastChangeUser ?? null,
    permalink: input.permalink ?? null,
    publishLink: input.publishLink ?? `https://hackmd.io/${input.id}`,
    publishedAtMillis: input.publishedAtMillis ?? null,
    publishType: input.publishType ?? 'edit',
    readPermission: input.readPermission ?? 'owner',
    shortId: input.shortId ?? input.id,
    tags: input.tags ?? [],
    tagsUpdatedAtMillis: input.tagsUpdatedAtMillis ?? null,
    teamPath: input.teamPath ?? null,
    title: input.title,
    titleUpdatedAtMillis: input.titleUpdatedAtMillis ?? null,
    updatedAtMillis: input.updatedAtMillis ?? null,
    userPath: input.userPath ?? null,
    writePermission: input.writePermission ?? 'owner',
  };
}

function renderFolderNavigator(overrides: Partial<FolderNavigatorProps> = {}) {
  const projectFolder = folder({
    color: '#ff5500',
    icon: '1F525',
    id: 'projects',
    name: 'Projects',
  });
  const notes = [
    note({
      folderPaths: [projectFolder],
      id: 'nested-note',
      tags: ['work'],
      title: 'Nested note',
      updatedAtMillis: 1_700_000_000_000,
    }),
    note({ id: 'loose-note', title: 'Loose note' }),
  ];
  const tree = buildHackmdFolderTree(notes, [projectFolder]);
  const props: FolderNavigatorProps = {
    entries: tree.allNotes,
    emptyState: {
      description: 'No notes yet',
      title: 'No notes',
    },
    finderState: DEFAULT_NOTE_FINDER_STATE,
    id: 'navigator-test',
    layout: {
      collapsed: false,
      collapsedFolderIds: new Set(),
      width: 320,
    },
    actions: {
      onCopyNoteLink: vi.fn(),
      onCopyNoteMarkdownLink: vi.fn(),
      onCreate: vi.fn(),
      onCreateFolder: vi.fn(),
      onCreateFolderInside: vi.fn(),
      onCreateNoteInside: vi.fn(),
      onChooseLocalVault: vi.fn(),
      onDeleteFolder: vi.fn(),
      onDeleteNote: vi.fn(),
      onDuplicateNote: vi.fn(),
      onExportNoteMarkdown: vi.fn(),
      onFinderStateChange: vi.fn(),
      onFolderDrop: vi.fn(),
      onFolderSelect: vi.fn(),
      onFolderToggle: vi.fn(),
      onFolderRevealInFinder: vi.fn(),
      onImportMarkdown: vi.fn(),
      onNoteMove: vi.fn(),
      onNoteSelect: vi.fn(),
      onNoteRevealInFinder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenPalette: vi.fn(),
      onOpenSettings: vi.fn(),
      onRefresh: vi.fn(),
      onRevealNoteFolder: vi.fn(),
      onRenameFolder: vi.fn(),
      onToggleCollapsed: vi.fn(),
    },
    scope: { id: 'personal', label: 'Personal', type: 'personal' },
    selection: {
      selectedFolderId: UNFILED_FOLDER_ID,
      selectedNoteId: null,
    },
    status: {
      activeError: null,
      canCreate: true,
      hasLocalVault: true,
      hasToken: true,
      isCreating: false,
      isFetching: false,
      isLoading: false,
      isMovingFolder: false,
      isMovingNote: false,
      showingCachedFallback: false,
    },
    tree,
  };
  const mergedProps: FolderNavigatorProps = {
    ...props,
    ...overrides,
    actions: { ...props.actions, ...overrides.actions },
    emptyState: { ...props.emptyState, ...overrides.emptyState },
    layout: { ...props.layout, ...overrides.layout },
    selection: { ...props.selection, ...overrides.selection },
    status: { ...props.status, ...overrides.status },
  };

  const view = render(
    <TooltipProvider>
      <FolderNavigator {...mergedProps} />
    </TooltipProvider>,
  );
  return { ...view, props: mergedProps };
}

function getFocusedTreeRowId() {
  return document.activeElement
    ?.closest('[data-folder-tree-row-id]')
    ?.getAttribute('data-folder-tree-row-id') ?? null;
}

function focusTreeRow(container: HTMLElement, rowId: string) {
  const row = container.querySelector<HTMLElement>(`[data-folder-tree-row-id="${rowId}"]`);
  const target = row?.querySelector<HTMLElement>('[data-folder-tree-primary="true"]')
    ?? row?.querySelector<HTMLElement>('button');

  expect(target).toBeTruthy();
  target?.focus();
  return target as HTMLElement;
}

describe('FolderNavigator', () => {
  it('renders loading skeleton while notes load', () => {
    renderFolderNavigator({ status: { isLoading: true } });

    expect(screen.getByLabelText('Loading notes')).toBeInTheDocument();
  });

  it('shows token setup actions when HackMD token is missing', () => {
    const tree = buildHackmdFolderTree([]);
    const onOpenSettings = vi.fn();
    renderFolderNavigator({
      entries: [],
      emptyState: {
        description: 'Add an API token to load your notes and teams.',
        title: 'Connect HackMD',
      },
      actions: { onOpenSettings },
      status: { hasToken: false },
      tree,
    });

    expect(screen.getByRole('heading', { name: 'Connect HackMD' })).toBeInTheDocument();
    expect(screen.getByText('Add an API token to load your notes and teams.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configure HackMD API Token' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configure Token' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Configure Token' }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('shows the local folder empty state when Local Vault is not configured', () => {
    const tree = buildHackmdFolderTree([]);
    const onChooseLocalVault = vi.fn();
    renderFolderNavigator({
      entries: [],
      emptyState: {
        description: 'Choose a folder to store plain Markdown notes on this device.',
        title: 'Open a local folder',
      },
      actions: { onChooseLocalVault },
      scope: { id: 'local', label: 'Local Vault', type: 'local' },
      status: { hasLocalVault: false },
      tree,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Local Vault' }));

    expect(screen.getByRole('heading', { name: 'Open a local folder' })).toBeInTheDocument();
    expect(screen.queryByText('Create your local vault')).not.toBeInTheDocument();
    expect(screen.getByText('Choose a folder to store plain Markdown notes on this device.')).toBeInTheDocument();
    expect(onChooseLocalVault).toHaveBeenCalledOnce();
  });

  it('forwards finder query changes through the navigator shell', () => {
    const onFinderStateChange = vi.fn();
    renderFolderNavigator({ actions: { onFinderStateChange } });

    expect(screen.getByRole('toolbar', { name: 'Note navigator actions' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Note finder controls' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search notes'), {
      target: { value: 'nested' },
    });

    expect(onFinderStateChange).toHaveBeenCalledWith({
      ...DEFAULT_NOTE_FINDER_STATE,
      query: 'nested',
    });
  });

  it('clears search and filters with Escape before returning focus to the tree', async () => {
    const onFinderStateChange = vi.fn();
    const queryView = renderFolderNavigator({
      actions: { onFinderStateChange },
      finderState: {
        ...DEFAULT_NOTE_FINDER_STATE,
        query: 'nested',
      },
    });

    const queryInput = screen.getByPlaceholderText('Search notes');
    queryInput.focus();
    fireEvent.keyDown(queryInput, { key: 'Escape' });

    expect(onFinderStateChange).toHaveBeenCalledWith(DEFAULT_NOTE_FINDER_STATE);

    queryView.unmount();
    onFinderStateChange.mockClear();
    const filterView = renderFolderNavigator({
      actions: { onFinderStateChange },
      finderState: {
        ...DEFAULT_NOTE_FINDER_STATE,
        tagFilters: ['work'],
      },
    });

    const filterInput = screen.getByPlaceholderText('Search notes');
    filterInput.focus();
    fireEvent.keyDown(filterInput, { key: 'Escape' });

    expect(onFinderStateChange).toHaveBeenCalledWith(DEFAULT_NOTE_FINDER_STATE);

    filterView.unmount();
    const treeView = renderFolderNavigator();
    const emptyInput = screen.getByPlaceholderText('Search notes');
    emptyInput.focus();
    fireEvent.keyDown(emptyInput, { key: 'Escape' });

    await waitFor(() => {
      expect(getFocusedTreeRowId()).toBe(`folder:${UNFILED_FOLDER_ID}`);
    });

    treeView.unmount();
  });

  it('uses roving focus for navigator header actions', async () => {
    renderFolderNavigator();

    await expectToolbarRovingFocus('Note navigator actions', [
      'Refresh notes',
      'Create note',
      'Navigator actions',
      'Collapse note navigator',
    ]);
  });

  it('keeps disabled create action focusable and explainable', async () => {
    const onCreate = vi.fn();
    renderFolderNavigator({
      actions: { onCreate },
      status: {
        canCreate: false,
      },
    });

    const createButton = screen.getByRole('button', { name: 'Create note' });
    fireEvent.mouseOver(createButton);
    expectDisabledToolbarAction(createButton, onCreate);

    expect(await screen.findByText('Connect HackMD to create notes.')).toBeVisible();
  });

  it('uses roving focus for finder dropdown controls', async () => {
    renderFolderNavigator();

    await expectToolbarRovingFocus('Note finder controls', [
      'Search scope',
      'Sort notes',
      'Filter notes',
    ]);
  });

  it('returns focus to finder dropdown trigger when its menu closes', async () => {
    renderFolderNavigator();

    const trigger = screen.getByRole('button', { name: 'Search scope' });
    await expectMenuReturnsFocus(trigger, (menu) => {
      fireEvent.keyDown(menu, { key: 'Escape' });
    });
  });

  it('keeps folder icon and color metadata visible in folder rows', () => {
    const { container } = renderFolderNavigator();

    const glyph = container.querySelector('[data-folder-glyph="1F525"]');

    expect(glyph).toBeInTheDocument();
    expect(glyph).toHaveAttribute('data-folder-color', '#ff5500');
  });

  it('collapses to zero width without rendering a mini navigator rail', () => {
    const { container } = renderFolderNavigator({
      layout: { collapsed: true },
    });

    expect(container.firstElementChild).toHaveStyle({ width: '0px' });
    expect(screen.queryByRole('button', { name: 'Expand note navigator' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search notes')).not.toBeInTheDocument();
  });

  it('keeps folder toggle and note select callbacks wired', () => {
    const onFolderToggle = vi.fn();
    const onNoteSelect = vi.fn();
    renderFolderNavigator({ actions: { onFolderToggle, onNoteSelect } });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nested note' }));

    expect(onFolderToggle).toHaveBeenCalledWith('projects');
    expect(onNoteSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'nested-note' }));
  });

  it('keeps folder rows on native buttons for the keyboard path', () => {
    renderFolderNavigator();

    const folderButton = screen.getByRole('button', { name: 'Projects' });
    const noteButton = screen.getByRole('button', { name: 'Nested note' });
    const collapseButton = screen.getByRole('button', { name: 'Collapse Projects' });

    expect(folderButton).toHaveAttribute('data-folder-tree-primary', 'true');
    expect(noteButton).toHaveAttribute('data-folder-tree-primary', 'true');
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('treats note timestamp as part of the primary row target', () => {
    const onNoteSelect = vi.fn();
    renderFolderNavigator({ actions: { onNoteSelect } });

    fireEvent.click(screen.getByText(formatDate(1_700_000_000_000)));

    expect(onNoteSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'nested-note' }));
  });

  it('keeps busy folder drag handles focusable but non-draggable', () => {
    const onFolderSelect = vi.fn();
    renderFolderNavigator({
      actions: { onFolderSelect },
      status: { isMovingFolder: true },
    });

    const dragHandle = screen.getByRole('button', { name: 'Drag Projects' });
    dragHandle.focus();

    expect(document.activeElement).toBe(dragHandle);
    expect(dragHandle).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));

    expect(onFolderSelect).toHaveBeenCalledWith('projects');
  });

  it('marks the current navigator row with aria-current and a non-color-only indicator', () => {
    renderFolderNavigator({
      selection: {
        selectedFolderId: null,
        selectedNoteId: 'nested-note',
      },
    });

    const selectedNote = screen.getByRole('button', { name: 'Nested note' });

    expect(selectedNote).toHaveAttribute('aria-current', 'page');
    expect(selectedNote.parentElement).toHaveClass('before:bg-primary-default');
    expect(selectedNote.parentElement).toHaveClass('focus-within:ring-inset');
  });

  it('uses list semantics for the navigator tree and finder results', () => {
    renderFolderNavigator();

    expect(screen.getByRole('list', { name: 'Folders and notes' })).toBeInTheDocument();

    renderFolderNavigator({
      finderState: {
        ...DEFAULT_NOTE_FINDER_STATE,
        query: 'note',
      },
    });

    expect(screen.getByRole('list', { name: 'Search results' })).toBeInTheDocument();
  });

  it('moves focus through visible tree rows with arrow keys and Ctrl+N/P', () => {
    const { container } = renderFolderNavigator();
    const root = focusTreeRow(container, `folder:${UNFILED_FOLDER_ID}`);

    fireEvent.keyDown(root, { key: 'ArrowDown' });
    expect(getFocusedTreeRowId()).toBe('folder:projects');

    fireEvent.keyDown(document.activeElement ?? root, { ctrlKey: true, key: 'n' });
    expect(getFocusedTreeRowId()).toBe('note:nested-note');

    fireEvent.keyDown(document.activeElement ?? root, { ctrlKey: true, key: 'p' });
    expect(getFocusedTreeRowId()).toBe('folder:projects');

    fireEvent.keyDown(document.activeElement ?? root, { key: 'ArrowUp' });
    expect(getFocusedTreeRowId()).toBe(`folder:${UNFILED_FOLDER_ID}`);
  });

  it('moves focus to first and last visible tree rows with Home and End', () => {
    const { container } = renderFolderNavigator();
    const projects = focusTreeRow(container, 'folder:projects');

    fireEvent.keyDown(projects, { key: 'End' });
    expect(getFocusedTreeRowId()).toBe('note:loose-note');

    fireEvent.keyDown(document.activeElement ?? projects, { key: 'Home' });
    expect(getFocusedTreeRowId()).toBe(`folder:${UNFILED_FOLDER_ID}`);
  });

  it('expands and collapses folders with right and left arrows', () => {
    const onFolderToggle = vi.fn();
    const { container } = renderFolderNavigator({
      actions: { onFolderToggle },
      layout: { collapsedFolderIds: new Set(['projects']) },
    });
    const projects = focusTreeRow(container, 'folder:projects');

    fireEvent.keyDown(projects, { key: 'ArrowRight' });
    expect(onFolderToggle).toHaveBeenCalledWith('projects');

    const expanded = renderFolderNavigator({ actions: { onFolderToggle } });
    const expandedProjects = focusTreeRow(expanded.container, 'folder:projects');

    fireEvent.keyDown(expandedProjects, { key: 'ArrowRight' });
    expect(getFocusedTreeRowId()).toBe('note:nested-note');

    expandedProjects.focus();
    fireEvent.keyDown(expandedProjects, { key: 'ArrowLeft' });
    expect(onFolderToggle).toHaveBeenCalledWith('projects');
  });

  it('activates the focused folder or note with Enter', () => {
    const onFolderSelect = vi.fn();
    const onNoteSelect = vi.fn();
    const { container } = renderFolderNavigator({ actions: { onFolderSelect, onNoteSelect } });
    const projects = focusTreeRow(container, 'folder:projects');

    fireEvent.keyDown(projects, { key: 'Enter' });
    expect(onFolderSelect).toHaveBeenCalledWith('projects');

    const nestedNote = focusTreeRow(container, 'note:nested-note');
    fireEvent.keyDown(nestedNote, { key: 'Enter' });

    expect(onNoteSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'nested-note' }));
  });

  it('moves focus with typeahead without selecting or opening rows', () => {
    const onFolderSelect = vi.fn();
    const onNoteSelect = vi.fn();
    const { container } = renderFolderNavigator({ actions: { onFolderSelect, onNoteSelect } });
    const root = focusTreeRow(container, `folder:${UNFILED_FOLDER_ID}`);

    fireEvent.keyDown(root, { key: 'p' });
    expect(getFocusedTreeRowId()).toBe('folder:projects');

    fireEvent.keyDown(document.activeElement ?? root, { key: 'r' });
    expect(getFocusedTreeRowId()).toBe('folder:projects');
    expect(onFolderSelect).not.toHaveBeenCalled();
    expect(onNoteSelect).not.toHaveBeenCalled();
  });

  it('resets the typeahead buffer after the timeout', () => {
    vi.useFakeTimers();
    try {
      const { container } = renderFolderNavigator();
      const root = focusTreeRow(container, `folder:${UNFILED_FOLDER_ID}`);

      fireEvent.keyDown(root, { key: 'p' });
      expect(getFocusedTreeRowId()).toBe('folder:projects');

      act(() => {
        vi.advanceTimersByTime(701);
      });

      fireEvent.keyDown(document.activeElement ?? root, { key: 'l' });
      expect(getFocusedTreeRowId()).toBe('note:loose-note');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps typeahead limited to visible rows', () => {
    const { container } = renderFolderNavigator({
      layout: { collapsedFolderIds: new Set(['projects']) },
    });
    const root = focusTreeRow(container, `folder:${UNFILED_FOLDER_ID}`);

    fireEvent.keyDown(root, { key: 'n' });

    expect(getFocusedTreeRowId()).toBe(`folder:${UNFILED_FOLDER_ID}`);
  });

  it('does not intercept typing in navigator inputs', () => {
    const { container } = renderFolderNavigator();
    const searchInput = screen.getByPlaceholderText('Search notes');

    searchInput.focus();
    fireEvent.keyDown(searchInput, { key: 'p' });

    expect(container.querySelector('[data-folder-tree-row-id="folder:projects"]')).toBeInTheDocument();
    expect(document.activeElement).toBe(searchInput);
  });

  it('runs focused row keyboard commands through existing actions', () => {
    const onCreateNoteInside = vi.fn();
    const onDeleteFolder = vi.fn();
    const onDeleteNote = vi.fn();
    const onOpenNote = vi.fn();
    const onRenameFolder = vi.fn();
    const { container } = renderFolderNavigator({
      actions: {
        onCreateNoteInside,
        onDeleteFolder,
        onDeleteNote,
        onOpenNote,
        onRenameFolder,
      },
    });
    const projects = focusTreeRow(container, 'folder:projects');

    fireEvent.keyDown(projects, { key: 'N', metaKey: true, shiftKey: true });
    expect(onCreateNoteInside).toHaveBeenCalledWith('projects');

    fireEvent.keyDown(projects, { key: 'F2' });
    expect(onRenameFolder).toHaveBeenCalledWith('projects');

    fireEvent.keyDown(projects, { key: 'Backspace', metaKey: true });
    expect(onDeleteFolder).toHaveBeenCalledWith('projects');

    const nestedNote = focusTreeRow(container, 'note:nested-note');
    fireEvent.keyDown(nestedNote, { key: 'Enter', metaKey: true });
    expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'nested-note' }));

    fireEvent.keyDown(nestedNote, { key: 'N', ctrlKey: true, shiftKey: true });
    expect(onCreateNoteInside).toHaveBeenCalledWith('projects');

    fireEvent.keyDown(nestedNote, { key: 'Backspace', ctrlKey: true });
    expect(onDeleteNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'nested-note' }));
  });

  it('does not delete with bare Delete or Backspace and does not delete root', () => {
    const onDeleteFolder = vi.fn();
    const onDeleteNote = vi.fn();
    const { container } = renderFolderNavigator({ actions: { onDeleteFolder, onDeleteNote } });
    const root = focusTreeRow(container, `folder:${UNFILED_FOLDER_ID}`);

    fireEvent.keyDown(root, { key: 'Backspace', metaKey: true });
    fireEvent.keyDown(root, { key: 'Delete' });

    const nestedNote = focusTreeRow(container, 'note:nested-note');
    fireEvent.keyDown(nestedNote, { key: 'Backspace' });
    fireEvent.keyDown(nestedNote, { key: 'Delete' });

    expect(onDeleteFolder).not.toHaveBeenCalled();
    expect(onDeleteNote).not.toHaveBeenCalled();
  });

  it('adds create note actions to folder context menus', async () => {
    const onCreateNoteInside = vi.fn();
    renderFolderNavigator({ actions: { onCreateNoteInside } });

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Projects' }));
    fireEvent.click(await screen.findByText('New Note Inside'));

    await waitFor(() => {
      expect(onCreateNoteInside).toHaveBeenCalledWith('projects');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Projects' }));
    });

    fireEvent.contextMenu(screen.getByRole('button', { name: /Root/ }));
    fireEvent.click(await screen.findByText('New Note'));

    await waitFor(() => {
      expect(onCreateNoteInside).toHaveBeenCalledWith(null);
    });
  });

  it('does not show folder reveal actions for notes already rendered in the folder tree', async () => {
    renderFolderNavigator();

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Nested note' }));

    expect(await screen.findByText('Duplicate Note')).toBeVisible();
    expect(screen.queryByText('Reveal Folder')).not.toBeInTheDocument();
    expect(screen.queryByText('Show in Folder')).not.toBeInTheDocument();
  });

  it('adds show in folder to finder result note context menus', async () => {
    const onRevealNoteFolder = vi.fn();
    renderFolderNavigator({
      actions: { onRevealNoteFolder },
      finderState: {
        ...DEFAULT_NOTE_FINDER_STATE,
        query: 'nested',
      },
    });

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Nested note' }));
    fireEvent.click(await screen.findByText('Show in Folder'));

    await waitFor(() => {
      expect(onRevealNoteFolder).toHaveBeenCalledWith(expect.objectContaining({
        note: expect.objectContaining({ id: 'nested-note' }),
      }));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Nested note' }));
    });
  });
});
