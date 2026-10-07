import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  act(() => target?.focus());
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

  it('lists Local Vault files that were not loaded, and why', () => {
    const skippedFiles = [
      { relativePath: 'Archive/Huge.md', reason: 'Larger than 10 MiB' },
      { relativePath: 'Big.md', reason: 'Larger than 10 MiB' },
    ];
    const { rerender, props } = renderFolderNavigator({
      scope: { id: 'local', label: 'Local Vault', type: 'local' },
      status: { skippedFiles },
    });

    expect(screen.getByText('2 files were not loaded.').closest('[role="status"]')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Files not loaded' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Archive/Huge.md — Larger than 10 MiB',
      'Big.md — Larger than 10 MiB',
    ]);

    rerender(
      <TooltipProvider>
        <FolderNavigator {...props} status={{ ...props.status, skippedFiles: [] }} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole('list', { name: 'Files not loaded' })).not.toBeInTheDocument();
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

  it('keeps tag selection in the tag browser instead of the filter menu', async () => {
    const onFinderStateChange = vi.fn();
    renderFolderNavigator({ actions: { onFinderStateChange } });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Filter notes' }));
    const filterMenu = await screen.findByRole('menu');

    expect(filterMenu).toHaveTextContent('Read Permission');
    expect(filterMenu).toHaveTextContent('Write Permission');
    expect(screen.queryByRole('menuitemcheckbox', { name: 'work' })).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Filter by tag work' }));

    expect(onFinderStateChange).toHaveBeenCalledWith({
      ...DEFAULT_NOTE_FINDER_STATE,
      searchScope: 'workspace',
      tagFilters: ['work'],
    });
  });

  it('adds tag browser selections to active tag filters', () => {
    const onFinderStateChange = vi.fn();
    renderFolderNavigator({
      actions: { onFinderStateChange },
      finderState: { ...DEFAULT_NOTE_FINDER_STATE, tagFilters: ['existing'] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Filter by tag work' }));

    expect(onFinderStateChange).toHaveBeenCalledWith({
      ...DEFAULT_NOTE_FINDER_STATE,
      searchScope: 'workspace',
      tagFilters: ['existing', 'work'],
    });
  });

  it('returns focus to finder dropdown trigger when its menu closes', async () => {
    renderFolderNavigator();

    const trigger = screen.getByRole('button', { name: 'Search scope' });
    await expectMenuReturnsFocus(trigger, (menu) => {
      fireEvent.keyDown(menu, { key: 'Escape' });
    });
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
    fireEvent.click(screen.getByRole('treeitem', { name: 'Nested note' }));

    expect(onFolderToggle).toHaveBeenCalledWith('projects');
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

    fireEvent.click(screen.getByRole('treeitem', { name: 'Projects' }));

    expect(onFolderSelect).toHaveBeenCalledWith('projects');
  });

  it('reuses the file and folder icon positions for drag handles', () => {
    renderFolderNavigator();

    const folderHandle = screen.getByRole('button', { name: 'Drag Projects' });
    const noteHandle = screen.getByRole('button', { name: 'Drag Nested note' });

    expect(folderHandle.querySelector('[data-folder-glyph]')).toBeInTheDocument();
    expect(folderHandle.querySelector('.lucide-grip-vertical')).toBeInTheDocument();
    expect(noteHandle.querySelector('.lucide-file-text')).toBeInTheDocument();
    expect(noteHandle.querySelector('.lucide-grip-vertical')).toBeInTheDocument();
  });

  it('shows a compact note date with the full value in its tooltip', () => {
    const { container } = renderFolderNavigator();
    const date = container.querySelector('[data-note-id="nested-note"] time');

    expect(date).toHaveAttribute('datetime', new Date(1_700_000_000_000).toISOString());
    expect(date).toHaveAttribute('title');
    expect(date?.parentElement).toHaveClass('note-row-date');
    expect(date?.textContent).not.toContain(':');
  });

  it('marks the selected tree row without changing selection on focus', () => {
    renderFolderNavigator({
      selection: {
        selectedFolderId: 'projects',
        selectedNoteId: 'nested-note',
      },
    });

    const selectedNote = screen.getByRole('treeitem', { name: 'Nested note' });

    expect(selectedNote).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('treeitem', { name: 'Projects' })).toHaveAttribute('aria-selected', 'false');
    expect(selectedNote).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(selectedNote, { key: 'ArrowDown' });
    expect(selectedNote).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('treeitem', { name: 'Loose note' })).toHaveAttribute('aria-selected', 'false');
  });

  it('uses tree semantics for folders while finder results remain a list', () => {
    renderFolderNavigator();

    expect(screen.getByRole('tree', { name: 'Folders and notes' })).toBeInTheDocument();

    renderFolderNavigator({
      finderState: {
        ...DEFAULT_NOTE_FINDER_STATE,
        query: 'note',
      },
    });

    expect(screen.getByRole('list', { name: 'Search results' })).toBeInTheDocument();
  });

  it('announces hierarchy and expanded state with owned child groups', () => {
    renderFolderNavigator();
    const tree = screen.getByRole('tree', { name: 'Folders and notes' });
    const items = within(tree).getAllByRole('treeitem');
    expect(items.filter(item => item.tabIndex === 0)).toHaveLength(1);
    const projects = within(tree).getByRole('treeitem', { name: 'Projects' });
    expect(projects).toHaveAttribute('aria-level', '1');
    expect(projects).toHaveAttribute('aria-expanded', 'true');
    const owned = projects.getAttribute('aria-owns')!.split(' ').map(id => document.getElementById(id)!);
    expect(owned[0]).toHaveAccessibleName('Collapse Projects');
    expect(owned[1]).toHaveAccessibleName('Drag Projects');
    const group = owned[2];
    expect(group).toHaveAttribute('role', 'group');
    const nested = within(group!).getByRole('treeitem', { name: 'Nested note' });
    expect(nested).toHaveAttribute('aria-level', '2');
    expect(nested).not.toHaveAttribute('aria-expanded');
    const root = within(tree).getByRole('treeitem', { name: /Root/ });
    expect(root).not.toHaveAttribute('aria-expanded');
    expect(within(tree).getByRole('treeitem', { name: 'Loose note' })).toHaveAttribute('aria-level', '1');
  });

  it('returns a hidden child focus to its collapsed parent', () => {
    const { container, props, rerender } = renderFolderNavigator();
    focusTreeRow(container, 'note:nested-note');
    rerender(<TooltipProvider><FolderNavigator {...props} layout={{ ...props.layout, collapsedFolderIds: new Set(['projects']) }} /></TooltipProvider>);
    const parent = screen.getByRole('treeitem', { name: 'Projects' });
    expect(parent).toHaveFocus();
    expect(parent).toHaveAttribute('tabindex', '0');
    expect(parent).toHaveAttribute('aria-expanded', 'false');
    expect(props.actions.onNoteSelect).not.toHaveBeenCalled();
  });

  it('places the roving tree node before its keyboard-accessible row controls', () => {
    const { container } = renderFolderNavigator();
    for (const [rowId, name] of [['folder:projects', 'Projects'], ['note:nested-note', 'Nested note']]) {
      const node = focusTreeRow(container, rowId);
      const row = node.closest('[data-folder-tree-row-id]')!;
      const stops = Array.from(row.querySelectorAll<HTMLElement>('[tabindex="0"]'));
      expect(stops[0]).toBe(node);
      expect(stops.at(-1)).toHaveAccessibleName(`Drag ${name}`);
    }
  });

  it('moves left from a note to its parent', () => {
    const { container } = renderFolderNavigator();
    const note = focusTreeRow(container, 'note:nested-note');
    fireEvent.keyDown(note, { key: 'ArrowLeft' });
    expect(getFocusedTreeRowId()).toBe('folder:projects');
  });

  it('leaves drag-handle arrows and IME input to their existing handlers', () => {
    renderFolderNavigator();
    const handle = screen.getByRole('button', { name: 'Drag Projects' });
    act(() => handle.focus());
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(handle).toHaveFocus();
    const projects = screen.getByRole('treeitem', { name: 'Projects' });
    act(() => projects.focus());
    fireEvent.keyDown(projects, { key: 'n', isComposing: true });
    expect(projects).toHaveFocus();
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
    expect(container.querySelector('[data-folder-tree-row-id="note:nested-note"]')).not.toBeInTheDocument();
    expect(screen.queryByText('Nested note')).not.toBeInTheDocument();
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

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Projects' }));
    fireEvent.click(await screen.findByText('New Note Inside'));

    await waitFor(() => {
      expect(onCreateNoteInside).toHaveBeenCalledWith('projects');
      expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'Projects' }));
    });

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: /Root/ }));
    fireEvent.click(await screen.findByText('New Note'));

    await waitFor(() => {
      expect(onCreateNoteInside).toHaveBeenCalledWith(null);
    });
  });

  it('does not show folder reveal actions for notes already rendered in the folder tree', async () => {
    renderFolderNavigator();

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Nested note' }));

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
