import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';
import type { FolderPathSummary, NoteSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  expectMenuReturnsFocus,
} from '@/test/accessibility-contracts';

import { FolderNavigator, type FolderNavigatorProps } from './FolderNavigator';
import { NoteSummaryCard } from './FolderNavigatorRows';
import { createOverlayWrapper } from './test-overlays';
import type { WorkbenchOverlays } from './workbench-overlays';

const { treeRender } = vi.hoisted(() => ({ treeRender: vi.fn() }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...core,
    DndContext: (props: ComponentProps<typeof core.DndContext>) => {
      treeRender();
      return <core.DndContext {...props} />;
    },
  };
});

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

type FolderNavigatorPropsOverrides = Partial<Omit<FolderNavigatorProps, 'actions' | 'emptyState' | 'layout' | 'selection' | 'status' | 'workspace'>> & {
  actions?: Partial<FolderNavigatorProps['actions']>;
  emptyState?: Partial<FolderNavigatorProps['emptyState']>;
  layout?: Partial<FolderNavigatorProps['layout']>;
  selection?: Partial<FolderNavigatorProps['selection']>;
  status?: Partial<FolderNavigatorProps['status']>;
  workspace?: Partial<FolderNavigatorProps['workspace']>;
  /** The workbench overlays the navigator starts with, such as Trash being open. */
  overlays?: Partial<WorkbenchOverlays>;
};

function renderFolderNavigator(overrides: FolderNavigatorPropsOverrides = {}) {
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
    workspace: {
      platform: 'darwin',
      pinnedTeamIds: null,
      onPinnedTeamIdsChange: vi.fn(),
      scope: { type: 'personal', label: 'My Workspace' },
      teams: [],
      localVaults: [],
      onChooseLocalVault: vi.fn(),
      onSwitchLocalVault: vi.fn(),
      onScopeChange: vi.fn(),
      onOpenSettings: vi.fn(),
    },
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
    },
    scope: { label: 'Personal', type: 'personal' },
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
    workspace: { ...props.workspace, ...overrides.workspace },
  };

  // As a wrapper, the query client survives rerender() calls that pass only the navigator.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const overlays = createOverlayWrapper(overrides.overlays);
  const view = render(
    <TooltipProvider>
      <FolderNavigator {...mergedProps} />
    </TooltipProvider>,
    { wrapper: ({ children }) => <QueryClientProvider client={queryClient}><overlays.wrapper>{children}</overlays.wrapper></QueryClientProvider> },
  );
  return { ...view, props: mergedProps, overlayStore: overlays.store };
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
  // A test that turns tag grouping off doesn't leave it off for the next one.
  afterEach(() => window.localStorage.removeItem('hackdesk_tag_grouping'));

  it('keeps the mounted tree out of search keystroke renders', () => {
    const { props, rerender } = renderFolderNavigator();
    const renderCount = treeRender.mock.calls.length;
    expect(renderCount).toBeGreaterThan(0);
    for (const query of ['n', 'ne', 'nested']) {
      rerender(
        <TooltipProvider><FolderNavigator {...props} finderState={{ ...props.finderState, query }} /></TooltipProvider>,
      );
    }
    expect(treeRender).toHaveBeenCalledTimes(renderCount);
  });

  it('moves the highlighted search result from the search box and opens it with Enter', () => {
    const { props } = renderFolderNavigator({ finderState: { ...DEFAULT_NOTE_FINDER_STATE, query: 'note' } });
    const search = screen.getByPlaceholderText('Search notes');
    const results = within(screen.getByRole('list', { name: 'Search results' })).getAllByRole('listitem');
    const highlighted = () => results.findIndex(result => result.querySelector('[data-folder-tree-kind="note"]')!.id !== '');
    const status = screen.getByRole('status');
    search.focus();

    expect(highlighted()).toBe(0);
    expect(status).toHaveTextContent('Nested note, 1 of 2. Enter opens it.');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(highlighted()).toBe(1);
    expect(status).toHaveTextContent('Loose note, 2 of 2.');
    fireEvent.keyDown(search, { key: 'n', ctrlKey: true });
    expect(highlighted()).toBe(0);
    fireEvent.keyDown(search, { key: 'p', ctrlKey: true });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(search).toHaveFocus();
    expect(props.actions.onNoteSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'loose-note' }));
  });

  it('moves from an empty search box into the tree with Down', async () => {
    renderFolderNavigator();
    const search = screen.getByPlaceholderText('Search notes');
    search.focus();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('role', 'treeitem'));
  });

  it('shows every folder in the working set as its own root with its own tree', () => {
    const onOpenWorkspaceFolder = vi.fn();
    const onOpenWorkspaceNote = vi.fn();
    const bNote = note({ id: 'b-note', title: 'B note' });
    const bTree = buildHackmdFolderTree([bNote]);
    renderFolderNavigator({
      scope: { type: 'local', label: 'Work', vaultId: 'vault-a' },
      localWorkspaceName: 'Work',
      vaultFolderName: 'A',
      workspaceFolders: [
        { id: 'vault-a', label: 'A', path: '/tmp/A', active: true, snapshotVaultId: 'A', tree: buildHackmdFolderTree([]), isLoading: false, error: null },
        { id: 'vault-b', label: 'B', path: '/tmp/B', active: false, snapshotVaultId: 'B', tree: bTree, isLoading: false, error: null },
      ],
      actions: { onOpenWorkspaceFolder, onOpenWorkspaceNote },
      workspace: { activeLocalVaultId: 'vault-a' },
    });

    expect(screen.getByRole('button', { name: 'Collapse Files' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open B' })).toBeVisible();
    // B's notes are already listed; selecting one opens it through the workspace action.
    fireEvent.click(screen.getByRole('button', { name: 'B note' }));
    expect(onOpenWorkspaceNote).toHaveBeenCalledWith('vault-b', expect.objectContaining({ id: 'b-note' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open B' }));
    expect(onOpenWorkspaceFolder).toHaveBeenCalledWith('vault-b', []);
  });


  it('shows another folder with its sub-folders closed unless that folder left them open', async () => {
    const onWorkspaceFolderAction = vi.fn();
    const plans = folder({ id: 'local-folder:Plans', name: 'Plans' });
    const drafts = folder({ id: 'local-folder:Drafts', name: 'Drafts' });
    const bTree = buildHackmdFolderTree([
      note({ id: 'plan', title: 'Plan', folderPaths: [plans] }),
      note({ id: 'draft', title: 'Draft', folderPaths: [drafts] }),
    ], [plans, drafts]);
    // B was open earlier with Drafts expanded; its live tree saved that under its scope.
    localStorage.setItem('hackdesk_folder_expanded:local:B', JSON.stringify(['local-folder:Drafts']));
    renderFolderNavigator({
      scope: { type: 'local', label: 'Work', vaultId: 'A' },
      localWorkspaceName: 'Work',
      vaultFolderName: 'A',
      workspaceFolders: [
        { id: 'vault-a', label: 'A', path: '/tmp/A', active: true, snapshotVaultId: 'A', tree: buildHackmdFolderTree([]), isLoading: false, error: null },
        { id: 'vault-b', label: 'B', path: '/tmp/B', active: false, snapshotVaultId: 'B', tree: bTree, isLoading: false, error: null },
      ],
      workspace: { activeLocalVaultId: 'vault-a' },
      actions: { onWorkspaceFolderAction },
    });

    expect(screen.getByRole('button', { name: 'Expand Plans' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse Drafts' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Draft' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'New note in Plans' }));
    expect(onWorkspaceFolderAction).toHaveBeenCalledWith('vault-b', ['local-folder:Plans'], 'create-note', undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Folder actions for Plans' }));
    fireEvent.click(await screen.findByText('Move to…'));
    await waitFor(() => expect(onWorkspaceFolderAction).toHaveBeenCalledWith('vault-b', ['local-folder:Plans'], 'move', undefined));

    fireEvent.click(screen.getByRole('button', { name: 'Expand Plans' }));
    expect(screen.getByRole('button', { name: 'Plan' })).toBeVisible();
    // Opening B later shows the same folders open.
    expect(JSON.parse(localStorage.getItem('hackdesk_folder_expanded:local:B') ?? '[]'))
      .toEqual(['local-folder:Drafts', 'local-folder:Plans']);
    localStorage.clear();
  });

  it('leaves the local folders out of a HackMD workspace while a local set stays open', () => {
    renderFolderNavigator({
      scope: { type: 'personal', label: 'My Workspace' },
      localWorkspaceName: 'Work',
      vaultFolderName: 'A',
      workspaceFolders: [
        { id: 'vault-a', label: 'A', path: '/tmp/A', active: true, snapshotVaultId: 'A', tree: buildHackmdFolderTree([]), isLoading: false, error: null },
        { id: 'vault-b', label: 'B', path: '/tmp/B', active: false, snapshotVaultId: 'B', tree: buildHackmdFolderTree([note({ id: 'b-note', title: 'B note' })]), isLoading: false, error: null },
      ],
      workspace: { activeLocalVaultId: 'vault-a' },
    });

    expect(document.querySelectorAll('[data-workspace-folder-id]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Open B' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'B note' })).not.toBeInTheDocument();
    // The HackMD notes show as usual under My Notes, with no local folder named beside it.
    expect(screen.getByRole('treeitem', { name: /Loose note/ })).toBeInTheDocument();
    expect(screen.queryByText('A', { exact: true })).not.toBeInTheDocument();
  });

  it('keeps the working set in its stored order whichever folder is open', () => {
    const folders = (activeId: string) => ['vault-a', 'vault-b', 'vault-c'].map((id) => ({
      id,
      label: id.slice(-1).toUpperCase(),
      path: `/tmp/${id}`,
      active: id === activeId,
      snapshotVaultId: null,
      tree: buildHackmdFolderTree([]),
      isLoading: false,
      error: null,
    }));
    const sectionOrder = () => Array.from(document.querySelectorAll<HTMLElement>('[data-workspace-folder-id]'))
      .map((section) => section.dataset.workspaceFolderId);
    const { props, rerender } = renderFolderNavigator({
      scope: { type: 'local', label: 'Work', vaultId: 'vault-a' },
      localWorkspaceName: 'Work',
      vaultFolderName: 'A',
      workspaceFolders: folders('vault-a'),
      workspace: { activeLocalVaultId: 'vault-a' },
    });
    expect(sectionOrder()).toEqual(['vault-a', 'vault-b', 'vault-c']);

    rerender(
      <TooltipProvider>
        <FolderNavigator
          {...props}
          scope={{ type: 'local', label: 'Work', vaultId: 'vault-c' }}
          vaultFolderName="C"
          workspaceFolders={folders('vault-c')}
          workspace={{ ...props.workspace, activeLocalVaultId: 'vault-c' }}
        />
      </TooltipProvider>,
    );
    expect(sectionOrder()).toEqual(['vault-a', 'vault-b', 'vault-c']);
  });

  it('moves a folder of the working set with Alt+Arrow keys', () => {
    const onReorderWorkspaceFolders = vi.fn();
    renderFolderNavigator({
      scope: { type: 'local', label: 'Work', vaultId: 'vault-a' },
      localWorkspaceName: 'Work',
      vaultFolderName: 'A',
      workspaceFolders: ['vault-a', 'vault-b', 'vault-c'].map((id) => ({
        id,
        label: id.slice(-1).toUpperCase(),
        path: `/tmp/${id}`,
        active: id === 'vault-a',
        snapshotVaultId: null,
        tree: buildHackmdFolderTree([]),
        isLoading: false,
        error: null,
      })),
      actions: { onReorderWorkspaceFolders },
      workspace: { activeLocalVaultId: 'vault-a' },
    });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Open C' }), { key: 'ArrowUp', altKey: true });
    expect(onReorderWorkspaceFolders).toHaveBeenLastCalledWith(['vault-a', 'vault-c', 'vault-b']);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Hide A notes' }), { key: 'ArrowDown', altKey: true });
    expect(onReorderWorkspaceFolders).toHaveBeenLastCalledWith(['vault-b', 'vault-a', 'vault-c']);
    // The first folder has nowhere to go up to.
    onReorderWorkspaceFolders.mockClear();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Hide A notes' }), { key: 'ArrowUp', altKey: true });
    expect(onReorderWorkspaceFolders).not.toHaveBeenCalled();
  });

  it('renders loading skeleton while notes load', () => {
    renderFolderNavigator({ status: { isLoading: true } });

    expect(screen.getByRole('status', { name: 'Loading notes' })).toHaveAttribute('aria-busy', 'true');
  });

  it('leaves the header without a bare note count', () => {
    renderFolderNavigator();
    // The tree shows the notes; the header names a count only for search results.
    expect(screen.queryByText('2 notes')).not.toBeInTheDocument();
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
      scope: { label: 'Local Vault', type: 'local' },
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
      scope: { label: 'Local Vault', type: 'local' },
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

    fireEvent.change(screen.getByPlaceholderText('Search notes'), {
      target: { value: 'nested' },
    });

    expect(onFinderStateChange).toHaveBeenCalledWith({
      ...DEFAULT_NOTE_FINDER_STATE,
      query: 'nested',
    });
  });

  it("shows where a note's text matched, and how much of HackMD the search covered", () => {
    renderFolderNavigator({
      finderState: { ...DEFAULT_NOTE_FINDER_STATE, query: 'budget' },
      textSearch: { matches: new Map([['loose-note', '…the \u0001budget\u0002 for Q3…']]), indexedCount: 4, source: 'hackmd' },
    });
    const highlight = screen.getByText('budget', { selector: 'mark' });
    expect(highlight.closest('[data-note-id]')).toHaveAttribute('data-note-id', 'loose-note');
    expect(screen.getByText("Searched the text of 4 notes you've opened.")).toBeInTheDocument();
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
      expect(getFocusedTreeRowId()).toBe('workspace:root');
    });

    treeView.unmount();
  });

  it('keeps tree notes to one line; the hover card carries the full title, folder and tags', () => {
    renderFolderNavigator();

    const nested = screen.getByRole('treeitem', { name: 'Nested note' });
    expect(nested).not.toHaveTextContent('work');
    expect(nested).not.toHaveTextContent('Projects');
    expect(screen.getByRole('treeitem', { name: 'Loose note' })).not.toHaveTextContent('loose-note');

    const { container } = render(<NoteSummaryCard entry={{
      note: note({ id: 'card-note', title: 'A long nested note title', tags: ['work'], updatedAtMillis: Date.UTC(2026, 9, 15) }),
      folderLabel: 'Projects',
      folderPath: [],
    }} />);
    const card = within(container);
    expect(card.getByText('A long nested note title')).toBeInTheDocument();
    expect(card.getByText('Projects')).toBeInTheDocument();
    expect(card.getByText('work')).toBeInTheDocument();
    expect(card.getByText(/^Edited /)).toBeInTheDocument();
  });

  it('keeps the header to the workspace switcher, with no action buttons', () => {
    renderFolderNavigator();

    // Folder actions are in context menus and the palette is a keyboard path, so nothing else here.
    expect(screen.queryByRole('toolbar', { name: 'Note navigator actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Navigator actions' })).not.toBeInTheDocument();
  });

  it('creates from the workspace row: New Note at the top level, and the other ways in its context menu', async () => {
    window.localStorage.clear();
    const onCreateNoteInside = vi.fn();
    const onImportMarkdown = vi.fn();
    renderFolderNavigator({ actions: { onCreateNoteInside, onImportMarkdown } });

    const root = screen.getByRole('treeitem', { name: 'My Notes' }).closest('[data-folder-tree-kind="root"]') as HTMLElement;
    fireEvent.click(within(root).getByRole('button', { name: 'New Note' }));
    expect(onCreateNoteInside).toHaveBeenCalledWith(null);

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'My Notes' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Import Markdown Note/ }));
    await vi.waitFor(() => expect(onImportMarkdown).toHaveBeenCalledTimes(1));
  });

  it('hides New Note where the workspace cannot take notes', () => {
    window.localStorage.clear();
    renderFolderNavigator({ status: { canCreate: false } });
    const root = screen.getByRole('treeitem', { name: 'My Notes' }).closest('[data-folder-tree-kind="root"]') as HTMLElement;
    expect(within(root).queryByRole('button', { name: 'New Note' })).not.toBeInTheDocument();
  });

  it('pins Trash above the account row, outside the tree', () => {
    window.hackdeskAPI = {
      hackmd: { listTrash: vi.fn(async () => []) },
    } as unknown as NonNullable<typeof window.hackdeskAPI>;
    const { overlayStore } = renderFolderNavigator({
      trash: { onOpenNote: vi.fn(), scope: { type: 'personal', label: 'My Workspace' } },
    });

    const tree = screen.getByTestId('folder-navigator-tree');
    const trashRow = screen.getByTestId('sidebar-trash-row');
    expect(tree).not.toContainElement(trashRow);
    fireEvent.click(within(trashRow).getByRole('button', { name: 'My Trash' }));
    expect(overlayStore.getState().trash).toBe(true);
    delete window.hackdeskAPI;
  });

  it('places History beside Trash and opens the history view', () => {
    const onScopeChange = vi.fn();
    renderFolderNavigator({ workspace: { onScopeChange }, trash: { onOpenNote: vi.fn(), scope: { type: 'personal', label: 'My Workspace' } } });
    const history = screen.getByRole('button', { name: 'History' });
    expect(screen.getByTestId('sidebar-destinations')).toContainElement(history);
    expect(screen.getByTestId('sidebar-destinations')).toContainElement(screen.getByTestId('sidebar-trash-row'));
    fireEvent.click(history);
    expect(onScopeChange).toHaveBeenCalledWith({ type: 'history', label: 'History' });
  });

  it('does not show History in a local vault', () => {
    renderFolderNavigator({ scope: { type: 'local', label: 'Notes' } });
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
  });

  it('shows History as a sidebar view with Back while keeping the workspace', async () => {
    window.hackdeskAPI = { hackmd: { listHistory: vi.fn(async () => ({ source: 'remote', data: [note({ id: 'recent', title: 'Recent note' }), note({ id: 'alpha', title: 'Alpha' })] })) } } as unknown as NonNullable<typeof window.hackdeskAPI>;
    const { props, overlayStore } = renderFolderNavigator({ history: true, overlays: { history: true } });
    expect(screen.getByRole('button', { name: 'Switch workspace, current: My Workspace' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Recent note' })).toBeVisible();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'View options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Title A-Z' }));
    expect(within(screen.getByRole('list', { name: 'Recently opened notes' })).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Alpha', 'Recent note']);
    fireEvent.click(screen.getByRole('button', { name: 'Back to notes' }));
    expect(overlayStore.getState().history).toBe(false);
    expect(props.workspace.onScopeChange).not.toHaveBeenCalled();
    delete window.hackdeskAPI;
  });

  it('shows Trash in place of the tree, with a way back', async () => {
    const { overlayStore } = renderFolderNavigator({
      trash: { onOpenNote: vi.fn(), scope: { type: 'personal', label: 'My Workspace' } },
      overlays: { trash: true },
    });

    expect(screen.getByText('Trash')).toBeInTheDocument();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to notes' }));
    expect(overlayStore.getState().trash).toBe(false);
  });

  it('keeps search as a header icon that opens across the row, and View options on the workspace row', () => {
    renderFolderNavigator();

    const search = screen.getByPlaceholderText('Search notes');
    const field = search.closest('label')!;
    expect(field).not.toHaveAttribute('data-search-open');
    fireEvent.focus(search);
    expect(field).toHaveAttribute('data-search-open', 'true');
    fireEvent.blur(search);
    expect(field).not.toHaveAttribute('data-search-open');

    // With nothing changed, the one View options button sits on the workspace root row.
    const root = screen.getByRole('treeitem', { name: 'My Notes' }).closest('[data-folder-tree-kind="root"]')!;
    expect(within(root as HTMLElement).getByRole('button', { name: 'View options' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View options' })).toHaveLength(1);
  });

  it('uses one root control to expand or collapse all folders', () => {
    const onExpandAllFolders = vi.fn();
    const onCollapseAllFolders = vi.fn();
    const { props, rerender } = renderFolderNavigator({
      actions: { onExpandAllFolders, onCollapseAllFolders },
      layout: { collapsedFolderIds: new Set(['projects']) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Expand all folders' }));
    expect(onExpandAllFolders).toHaveBeenCalledOnce();
    rerender(<TooltipProvider><FolderNavigator {...props} layout={{ ...props.layout, collapsedFolderIds: new Set() }} /></TooltipProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all folders' }));
    expect(onCollapseAllFolders).toHaveBeenCalledOnce();
  });

  it('offers hidden files in local View options', async () => {
    window.localStorage.removeItem('hackdesk_show_hidden_files');
    renderFolderNavigator({ scope: { type: 'local', label: 'Vault' } });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'View options' }));
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Show hidden files and folders' });
    expect(item).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(item);
    expect(window.localStorage.getItem('hackdesk_show_hidden_files')).toBe('true');
    window.localStorage.removeItem('hackdesk_show_hidden_files');
  });

  it('moves View options and the result count to the list header when the view changes', () => {
    renderFolderNavigator({ finderState: { ...DEFAULT_NOTE_FINDER_STATE, sortMode: 'title-asc' } });

    expect(screen.queryByRole('treeitem', { name: 'My Notes' })).not.toBeInTheDocument();
    // Its badge counts what differs from the default (the tooltip says so too).
    expect(screen.getByRole('button', { name: 'View options' })).toHaveTextContent('1');
    expect(screen.getByText(/^\d+ results?$/)).toBeInTheDocument();
  });

  it('holds scope, sort, permissions and tags in View options, and counts what differs from the default', async () => {
    const onFinderStateChange = vi.fn();
    renderFolderNavigator({
      actions: { onFinderStateChange },
      finderState: { ...DEFAULT_NOTE_FINDER_STATE, sortMode: 'title-asc', tagFilters: ['existing'] },
    });
    const trigger = screen.getByRole('button', { name: 'View options' });
    expect(trigger).toHaveTextContent('2');

    fireEvent.pointerDown(trigger);
    const menu = await screen.findByRole('menu');
    for (const section of ['Search In', 'Sort', 'Read Permission', 'Write Permission', 'Tags']) expect(menu).toHaveTextContent(section);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /^work/ }));

    expect(onFinderStateChange).toHaveBeenCalledWith({
      ...DEFAULT_NOTE_FINDER_STATE,
      sortMode: 'title-asc',
      searchScope: 'workspace',
      tagFilters: ['existing', 'work'],
    });
  });

  it('returns focus to the View options button when its menu closes', async () => {
    renderFolderNavigator();

    const trigger = screen.getByRole('button', { name: 'View options' });
    await expectMenuReturnsFocus(trigger, (menu) => {
      fireEvent.keyDown(menu, { key: 'Escape' });
    });
  });

  it('collapses to zero width, keeping its contents mounted but out of reach so the width can animate', () => {
    const { container } = renderFolderNavigator({
      layout: { collapsed: true },
    });

    expect(container.firstElementChild).toHaveStyle({ '--panel-width': '0px' });
    expect(container.firstElementChild).toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Expand note navigator' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search notes').closest('[inert]')).toBe(container.firstElementChild);
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

  it('keeps folder and note icons in one column, with the arrow in the folder icon slot and no hover grip', () => {
    renderFolderNavigator();

    // The folder's icon slot is its expand/collapse control: the glyph, turning into the arrow on hover.
    const toggle = screen.getByRole('button', { name: 'Collapse Projects' });
    expect(toggle.querySelector('[data-folder-glyph]')).toBeInTheDocument();
    expect(toggle.querySelector('.lucide-chevron-right')).toBeInTheDocument();
    // Rows drag from anywhere, so hovering shows no grip. The folder's drag button floats beside
    // its icon for the keyboard and shows only while it has keyboard focus.
    const folderHandle = screen.getByRole('button', { name: 'Drag Projects' });
    expect(folderHandle.className).toContain('absolute');
    expect(folderHandle.className).toContain('focus-visible:opacity-100');
    expect(folderHandle.className).not.toContain('group-hover/entity-row:opacity-100');
    const noteHandle = screen.getByRole('button', { name: 'Drag Nested note' });
    expect(noteHandle.querySelector('.lucide-file-text')).toBeInTheDocument();
    expect(noteHandle.querySelector('.lucide-grip-vertical')).not.toBeInTheDocument();
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
    // The flat root notes, so the levels below are the folder tree's alone.
    window.localStorage.setItem('hackdesk_tag_grouping', 'false');
    renderFolderNavigator();
    const tree = screen.getByRole('tree', { name: 'Folders and notes' });
    const items = within(tree).getAllByRole('treeitem');
    expect(items.filter(item => item.tabIndex === 0)).toHaveLength(1);
    const workspaceRoot = within(tree).getByRole('treeitem', { name: 'My Notes' });
    expect(workspaceRoot).toHaveAttribute('aria-level', '1');
    expect(workspaceRoot).toHaveAttribute('aria-expanded', 'true');
    const projects = within(tree).getByRole('treeitem', { name: 'Projects' });
    expect(projects).toHaveAttribute('aria-level', '2');
    expect(projects).toHaveAttribute('aria-expanded', 'true');
    const owned = projects.getAttribute('aria-owns')!.split(' ').map(id => document.getElementById(id)!);
    expect(owned[0]).toHaveAccessibleName('Collapse Projects');
    expect(owned[1]).toHaveAccessibleName('Drag Projects');
    const group = owned[2];
    expect(group).toHaveAttribute('role', 'group');
    const nested = within(group!).getByRole('treeitem', { name: 'Nested note' });
    expect(nested).toHaveAttribute('aria-level', '3');
    expect(nested).not.toHaveAttribute('aria-expanded');
    expect(within(tree).getByRole('treeitem', { name: 'Loose note' })).toHaveAttribute('aria-level', '2');
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
      expect(stops.some((stop) => stop.getAttribute('aria-label') === `Drag ${name}`)).toBe(true);
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
    window.localStorage.setItem('hackdesk_tag_grouping', 'false');
    const { container } = renderFolderNavigator();
    const root = focusTreeRow(container, 'workspace:root');

    fireEvent.keyDown(root, { key: 'ArrowDown' });
    expect(getFocusedTreeRowId()).toBe('folder:projects');

    const projects = focusTreeRow(container, 'folder:projects');
    fireEvent.keyDown(projects, { key: 'ArrowDown' });
    expect(getFocusedTreeRowId()).toBe('note:nested-note');

    fireEvent.keyDown(document.activeElement ?? projects, { ctrlKey: true, key: 'n' });
    expect(getFocusedTreeRowId()).toBe('note:loose-note');

    fireEvent.keyDown(document.activeElement ?? projects, { ctrlKey: true, key: 'p' });
    expect(getFocusedTreeRowId()).toBe('note:nested-note');

    fireEvent.keyDown(document.activeElement ?? projects, { key: 'ArrowUp' });
    expect(getFocusedTreeRowId()).toBe('folder:projects');
  });

  it('moves focus to first and last visible tree rows with Home and End', () => {
    const { container } = renderFolderNavigator({
      trash: { onOpenNote: vi.fn(), scope: { type: 'personal', label: 'My Workspace' } },
    });
    const projects = focusTreeRow(container, 'folder:projects');

    fireEvent.keyDown(projects, { key: 'End' });
    expect(getFocusedTreeRowId()).toBe('note:loose-note');

    fireEvent.keyDown(document.activeElement ?? projects, { key: 'Home' });
    expect(getFocusedTreeRowId()).toBe('workspace:root');
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
    const root = focusTreeRow(container, 'note:loose-note');

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
      const root = focusTreeRow(container, 'note:loose-note');

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
    const root = focusTreeRow(container, 'note:loose-note');

    fireEvent.keyDown(root, { key: 'n' });

    expect(getFocusedTreeRowId()).toBe('note:loose-note');
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

  it('does not delete with bare Delete or Backspace', () => {
    const onDeleteFolder = vi.fn();
    const onDeleteNote = vi.fn();
    const { container } = renderFolderNavigator({ actions: { onDeleteFolder, onDeleteNote } });
    const projects = focusTreeRow(container, 'folder:projects');

    fireEvent.keyDown(projects, { key: 'Delete' });

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

    // The space under the tree stands for the top level.
    fireEvent.contextMenu(screen.getByTestId('tree-top-level'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^New Note/ }));

    await waitFor(() => {
      expect(onCreateNoteInside).toHaveBeenCalledWith(null);
    });
  });

  it('renames a folder inline and opens its move picker from the row menu', async () => {
    const onRenameFolderInline = vi.fn();
    const onMoveFolderRequest = vi.fn();
    renderFolderNavigator({ actions: { onRenameFolderInline, onMoveFolderRequest } });
    fireEvent.click(screen.getByRole('button', { name: 'Folder actions for Projects' }));
    fireEvent.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: 'Rename folder' });
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.submit(input.closest('form')!);
    expect(onRenameFolderInline).toHaveBeenCalledWith('projects', 'Renamed');
    fireEvent.click(screen.getByRole('button', { name: 'Folder actions for Projects' }));
    fireEvent.click(await screen.findByText('Move to…'));
    await waitFor(() => expect(onMoveFolderRequest).toHaveBeenCalledWith('projects'));
  });

  it('renames and moves a note from its row menu', async () => {
    const onRenameNoteInline = vi.fn();
    const onMoveNoteRequest = vi.fn();
    renderFolderNavigator({ actions: { onRenameNoteInline, onMoveNoteRequest } });
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Loose note' }));
    fireEvent.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: 'Rename note' });
    fireEvent.change(input, { target: { value: 'Updated note' } });
    fireEvent.submit(input.closest('form')!);
    expect(onRenameNoteInline).toHaveBeenCalledWith(expect.objectContaining({ id: 'loose-note' }), 'Updated note');
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Loose note' }));
    fireEvent.click(await screen.findByText('Move to…'));
    await waitFor(() => expect(onMoveNoteRequest).toHaveBeenCalledWith(expect.objectContaining({ id: 'loose-note' })));
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

  it('renders the workspace root with the personal label', () => {
    renderFolderNavigator({ scope: { type: 'personal', label: 'Ignored' } });
    expect(within(screen.getByTestId('folder-navigator-tree')).getByRole('treeitem', { name: 'My Notes' })).toBeInTheDocument();
  });

  it('selects the top level when the workspace root row is clicked', () => {
    const onFolderSelect = vi.fn();
    renderFolderNavigator({ actions: { onFolderSelect } });
    fireEvent.click(screen.getByRole('treeitem', { name: 'My Notes' }));
    expect(onFolderSelect).toHaveBeenCalledWith(UNFILED_FOLDER_ID);
  });

  it('collapses the tree, persisting per scope', () => {
    window.localStorage.clear();
    const { props, rerender } = renderFolderNavigator({
      trash: { onOpenNote: vi.fn(), scope: { type: 'personal', label: 'My Workspace' } },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse My Notes' }));
    expect(screen.queryByRole('treeitem', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My Trash' })).toBeInTheDocument();

    rerender(<TooltipProvider><FolderNavigator {...props} /></TooltipProvider>);
    expect(screen.queryByRole('treeitem', { name: 'Projects' })).not.toBeInTheDocument();
  });

  it('mounts a folder\'s rows when first opened, then keeps them hidden while it is closed', () => {
    window.localStorage.clear();
    const { container, props, rerender } = renderFolderNavigator({ layout: { collapsedFolderIds: new Set(['projects']) } });
    const nestedRow = () => container.querySelector('[data-folder-tree-row-id="note:nested-note"]');
    // Never opened: nothing is built for it.
    expect(nestedRow()).toBeNull();

    const view = (collapsed: boolean) => (
      <TooltipProvider><FolderNavigator {...props} layout={{ ...props.layout, collapsedFolderIds: new Set(collapsed ? ['projects'] : []) }} /></TooltipProvider>
    );
    rerender(view(false));
    const row = nestedRow();
    expect(row).not.toBeNull();
    expect(screen.getByRole('treeitem', { name: 'Nested note' })).toBeVisible();

    rerender(view(true));
    expect(nestedRow()).toBe(row);
    expect(row!.closest('[hidden]')).not.toBeNull();
    expect(screen.queryByRole('treeitem', { name: 'Nested note' })).not.toBeInTheDocument();
  });

  it('keeps the rows mounted while the root is collapsed, so opening it is cheap', () => {
    window.localStorage.clear();
    const { container } = renderFolderNavigator();
    const row = container.querySelector('[data-folder-tree-row-id="folder:projects"]');
    expect(row).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse My Notes' }));
    // Hidden, not unmounted: the same element, out of the accessibility tree and keyboard path.
    expect(container.querySelector('[data-folder-tree-row-id="folder:projects"]')).toBe(row);
    expect(row!.closest('[hidden]')).not.toBeNull();
    expect(screen.queryByRole('treeitem', { name: 'Projects' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand My Notes' }));
    expect(container.querySelector('[data-folder-tree-row-id="folder:projects"]')).toBe(row);
    expect(screen.getByRole('treeitem', { name: 'Projects' })).toBeVisible();
  });

  it('creates a top-level folder from the root hover action and context menu', async () => {
    const onCreateFolderInside = vi.fn();
    renderFolderNavigator({ actions: { onCreateFolderInside } });
    fireEvent.click(screen.getByRole('button', { name: 'New Folder' }));
    expect(onCreateFolderInside).toHaveBeenCalledWith(null);

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'My Notes' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^New Folder/ }));
    expect(onCreateFolderInside).toHaveBeenCalledTimes(2);
  });

  it('expands and collapses the root section with arrow keys', () => {
    const { container } = renderFolderNavigator();
    const root = focusTreeRow(container, 'workspace:root');
    fireEvent.keyDown(root, { key: 'ArrowLeft' });
    expect(screen.queryByRole('treeitem', { name: 'Projects' })).not.toBeInTheDocument();
    fireEvent.keyDown(root, { key: 'ArrowRight' });
    expect(screen.getByRole('treeitem', { name: 'Projects' })).toBeInTheDocument();
  });

  it('omits the workspace root on the history scope', () => {
    const historyTree = buildHackmdFolderTree([note({ id: 'h1', title: 'Recent' })], []);
    renderFolderNavigator({
      scope: { type: 'history', label: 'History' },
      tree: historyTree,
      entries: historyTree.allNotes,
    });
    expect(screen.queryByRole('treeitem', { name: 'My Notes' })).not.toBeInTheDocument();
    expect(screen.getByText('Recent notes')).toBeVisible();
    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('FolderNavigator tag groups', () => {
  const TAG_GROUPING_KEYS = ['hackdesk_tag_grouping', 'hackdesk_tag_grouping_order', 'hackdesk_tag_grouping_collapsed'];

  beforeEach(() => {
    for (const key of TAG_GROUPING_KEYS) window.localStorage.removeItem(key);
  });

  afterAll(() => {
    for (const key of TAG_GROUPING_KEYS) window.localStorage.removeItem(key);
  });

  function renderTagGroupedNavigator(orderKey: 'a-z' | 'updated-desc' | 'updated-asc' = 'a-z') {
    // Root notes only: every note is folder-less, how the pre-folder view shows them.
    const notes = [
      note({ id: 'work-oldest', tags: ['work'], title: 'Work Oldest', updatedAtMillis: 1_700_000_000_000 }),
      note({ id: 'work-newest', tags: ['work'], title: 'Work Newest', updatedAtMillis: 1_700_000_900_000 }),
      note({ id: 'daily', tags: [], title: 'Daily Log' }),
      note({ id: 'personal', tags: ['personal'], title: 'Personal Note', updatedAtMillis: 1_700_000_500_000 }),
    ];
    const tree = buildHackmdFolderTree(notes, []);
    window.localStorage.setItem('hackdesk_tag_grouping', 'true');
    window.localStorage.setItem('hackdesk_tag_grouping_order', orderKey);
    const view = renderFolderNavigator({ tree, entries: tree.allNotes });
    return { ...view, tree };
  }

  it('groups root notes by default and keeps them flat once the view option is off', () => {
    const view = renderFolderNavigator();
    expect(screen.getByRole('treeitem', { name: 'Untagged group' })).toBeInTheDocument();

    view.unmount();
    window.localStorage.setItem('hackdesk_tag_grouping', 'false');
    renderFolderNavigator();
    expect(screen.queryByRole('treeitem', { name: 'Untagged group' })).not.toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Loose note' })).toBeVisible();
  });

  it('creates a note at the root from a grouped note, never in the group as a folder', () => {
    const onCreateNoteInside = vi.fn();
    const notes = [note({ id: 'work-note', tags: ['work'], title: 'Work Note' })];
    const tree = buildHackmdFolderTree(notes, []);
    window.localStorage.setItem('hackdesk_tag_grouping', 'true');
    const { container } = renderFolderNavigator({ tree, entries: tree.allNotes, actions: { onCreateNoteInside } });

    const grouped = focusTreeRow(container, 'note:work-note');
    fireEvent.keyDown(grouped, { key: 'N', metaKey: true, shiftKey: true });

    // A tag group is not a folder: its id must never reach note or folder creation.
    expect(onCreateNoteInside).toHaveBeenCalledWith(null);
  });

  it('groups root notes under first tags, all expanded by default', () => {
    const { container } = renderTagGroupedNavigator();

    const groupRows = [...container.querySelectorAll('[data-folder-tree-kind="tag-group"]')];
    expect(groupRows.map((row) => row.getAttribute('data-folder-tree-row-id'))).toEqual([
      'tag:personal',
      'tag:__untagged__',
      'tag:work',
    ]);
    // Default expanded: the notes sit visible under each group.
    expect(screen.getByRole('treeitem', { name: 'Personal Note' })).toBeVisible();
    expect(screen.getByRole('treeitem', { name: 'Work Newest' })).toBeVisible();
    expect(screen.getByRole('treeitem', { name: 'Daily Log' })).toBeVisible();
    const untagged = screen.getByRole('treeitem', { name: 'Untagged group' }).closest('[data-folder-tree-row-id]') as HTMLElement;
    expect(within(untagged).getByText('1')).toBeInTheDocument();
  });

  it('orders the groups by their newest note with the updated-time order', () => {
    const { container } = renderTagGroupedNavigator('updated-desc');

    const groupRows = [...container.querySelectorAll('[data-folder-tree-kind="tag-group"]')];
    expect(groupRows.map((row) => row.getAttribute('data-folder-tree-row-id'))).toEqual([
      'tag:work',
      'tag:personal',
      'tag:__untagged__',
    ]);
  });

  it('collapses one group without touching its siblings, and remembers it across views', () => {
    const view = renderTagGroupedNavigator();
    fireEvent.click(screen.getByRole('treeitem', { name: 'work group' }));

    expect(screen.queryByRole('treeitem', { name: 'Work Newest' })).not.toBeInTheDocument();
    expect(screen.queryByRole('treeitem', { name: 'Work Oldest' })).not.toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Personal Note' })).toBeVisible();
    expect(screen.getByRole('treeitem', { name: 'work group' })).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem('hackdesk_tag_grouping_collapsed')).toContain('work');

    // A fresh view opens in the same state: the collapsed group stays shut, others stay expanded.
    view.unmount();
    renderTagGroupedNavigator();
    expect(screen.queryByRole('treeitem', { name: 'Work Newest' })).not.toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Personal Note' })).toBeVisible();
  });

  it('toggles grouping from the tree View options and offers the tag order there', async () => {
    renderFolderNavigator();
    // On by default, so grouping alone isn't a changed view.
    const trigger = screen.getByRole('button', { name: 'View options' });
    expect(trigger).toHaveTextContent('');
    // Only folder-less notes group; the loose untagged note lands in the Untagged group.
    expect(screen.getByRole('treeitem', { name: 'Untagged group' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(trigger);
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Group by Tag');

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Group notes by first tag' }));
    expect(window.localStorage.getItem('hackdesk_tag_grouping')).toBe('false');
    await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'Untagged group' })).not.toBeInTheDocument());
    // Turning it off is the change the badge counts.
    expect(trigger).toHaveTextContent('1');

    fireEvent.keyDown(menu, { key: 'Escape' });
  });

  it('keeps the flat finder list in charge while grouping, so the tree option reaches it on return', async () => {
    renderTagGroupedNavigator('updated-desc');
    // The order choice persists with the option; the flat list itself never changes shape.
    expect(window.localStorage.getItem('hackdesk_tag_grouping_order')).toBe('updated-desc');
    expect(screen.getByRole('treeitem', { name: 'Work Newest' })).toBeVisible();
  });

  it('expands and collapses tag groups with arrow keys', () => {
    const { container } = renderTagGroupedNavigator();
    const group = focusTreeRow(container, 'tag:work');

    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.queryByRole('treeitem', { name: 'Work Newest' })).not.toBeInTheDocument();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByRole('treeitem', { name: 'Work Newest' })).toBeVisible();
  });
});
