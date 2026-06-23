import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';
import type { FolderPathSummary, NoteSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { TooltipProvider } from '@/components/ui/tooltip';

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
      onDeleteFolder: vi.fn(),
      onDeleteNote: vi.fn(),
      onDuplicateNote: vi.fn(),
      onExportNoteMarkdown: vi.fn(),
      onFinderStateChange: vi.fn(),
      onFolderDrop: vi.fn(),
      onFolderSelect: vi.fn(),
      onFolderToggle: vi.fn(),
      onImportMarkdown: vi.fn(),
      onNoteMove: vi.fn(),
      onNoteSelect: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenPalette: vi.fn(),
      onOpenSettings: vi.fn(),
      onRefresh: vi.fn(),
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
      actions: { onOpenSettings },
      status: { hasToken: false },
      tree,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Configure HackMD API Token' }));

    expect(screen.getByRole('button', { name: 'Configure Token' })).toBeInTheDocument();
    expect(onOpenSettings).toHaveBeenCalledOnce();
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

  it('keeps folder icon and color metadata visible in folder rows', () => {
    const { container } = renderFolderNavigator();

    const glyph = container.querySelector('[data-folder-glyph="1F525"]');

    expect(glyph).toBeInTheDocument();
    expect(glyph).toHaveAttribute('data-folder-color', '#ff5500');
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
});
