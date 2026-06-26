import {
  AlertCircle,
  FileText,
  PanelLeftClose,
  Plus,
  RefreshCcw,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import type { NoteSummary } from '@/lib/electron-api';
import {
  buildFolderDropOperation,
  flattenFolderTree,
  getProjectedFolderDrop,
  type FolderDropOperation,
} from '@/lib/hackmd-folder-dnd';
import {
  buildNoteDropOperation,
  getNoteCurrentFolderId,
  parseNoteDragId,
  type NoteDropOperation,
} from '@/lib/hackmd-note-dnd';
import {
  DEFAULT_NOTE_FINDER_STATE,
  getNoteFinderOptions,
  isNoteFinderActive,
  type NoteFinderState,
} from '@/lib/electron-note-finder';
import { buildNoteTagIndex } from '@/lib/electron-note-tags';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { cn } from '@/lib/utils';

import { EmptyState, PanelHeader, PanelShell, ToolbarIconButton } from './interaction-primitives';
import type { WorkspaceScope } from './types';
import { FolderActionsDropdown } from './FolderNavigatorActionsDropdown';
import { NoteFinderToolbar, TagBrowser } from './FolderNavigatorFinder';
import {
  FolderDragOverlay,
  FolderTreeView,
  NoteDragOverlay,
  NoteListSkeleton,
  NoteRow,
  RootFolderRow,
} from './FolderNavigatorRows';
import { RepositoryNotice } from './RepositoryNotice';
import { FOCUS_RING_CLASS } from './ui';

export type FolderNavigatorSelection = {
  selectedFolderId: string | null;
  selectedNoteId: string | null;
};

export type FolderNavigatorLayout = {
  collapsed: boolean;
  collapsedFolderIds: Set<string>;
  width: number;
};

export type FolderNavigatorStatus = {
  activeError: string | null;
  canCreate: boolean;
  hasToken: boolean;
  isCreating: boolean;
  isFetching: boolean;
  isLoading: boolean;
  isMovingFolder: boolean;
  isMovingNote: boolean;
  showingCachedFallback: boolean;
};

export type FolderNavigatorEmptyState = {
  description: string;
  title: string;
};

export type FolderNavigatorActions = {
  onCopyNoteLink: (note: NoteSummary) => void;
  onCopyNoteMarkdownLink: (note: NoteSummary) => void;
  onCreate: () => void;
  onCreateFolder: () => void;
  onCreateFolderInside: (folderId: string | null) => void;
  onCreateNoteInside: (folderId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onDuplicateNote: (note: NoteSummary) => void;
  onExportNoteMarkdown: (note: NoteSummary) => void;
  onFinderStateChange: (state: NoteFinderState) => void;
  onFolderDrop: (operation: FolderDropOperation) => void;
  onFolderSelect: (folderId: string | null) => void;
  onFolderToggle: (folderId: string) => void;
  onImportMarkdown: () => void;
  onNoteMove: (operation: NoteDropOperation) => void;
  onNoteSelect: (note: NoteSummary) => void;
  onOpenNote: (note: NoteSummary) => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onRenameFolder: (folderId: string) => void;
  onToggleCollapsed: () => void;
};

export type FolderNavigatorProps = {
  actions: FolderNavigatorActions;
  emptyState: FolderNavigatorEmptyState;
  entries: FolderTreeNote[];
  finderState: NoteFinderState;
  id: string;
  layout: FolderNavigatorLayout;
  scope: WorkspaceScope;
  selection: FolderNavigatorSelection;
  status: FolderNavigatorStatus;
  tree: FolderTree;
};

type TreeFocusItem = {
  depth: number;
  folderId?: string;
  hasChildren?: boolean;
  id: string;
  kind: 'folder' | 'note';
  note?: FolderTreeNote;
  parentFolderId: string | null;
};

function createFolderFocusId(folderId: string) {
  return `folder:${folderId}`;
}

function createNoteFocusId(noteId: string) {
  return `note:${noteId}`;
}

function getFolderTreeFocusItems(tree: FolderTree, collapsedFolderIds: Set<string>): TreeFocusItem[] {
  const items: TreeFocusItem[] = [{
    depth: 0,
    folderId: UNFILED_FOLDER_ID,
    hasChildren: tree.unfiled.notes.length > 0 || tree.roots.length > 0,
    id: createFolderFocusId(UNFILED_FOLDER_ID),
    kind: 'folder',
    parentFolderId: null,
  }];

  const appendFolder = (node: FolderTreeNode, parentFolderId: string | null, depth: number) => {
    const collapsed = collapsedFolderIds.has(node.id);
    items.push({
      depth,
      folderId: node.id,
      hasChildren: node.children.length > 0 || node.notes.length > 0,
      id: createFolderFocusId(node.id),
      kind: 'folder',
      parentFolderId,
    });

    if (collapsed) {
      return;
    }

    for (const child of node.children) {
      appendFolder(child, node.id, depth + 1);
    }

    for (const note of node.notes) {
      items.push({
        depth: depth + 1,
        id: createNoteFocusId(note.note.id),
        kind: 'note',
        note,
        parentFolderId: node.id,
      });
    }
  };

  for (const node of tree.roots) {
    appendFolder(node, null, 0);
  }

  for (const note of tree.unfiled.notes) {
    items.push({
      depth: 1,
      id: createNoteFocusId(note.note.id),
      kind: 'note',
      note,
      parentFolderId: UNFILED_FOLDER_ID,
    });
  }

  return items;
}

function getKeyboardFocusRowId(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>('[data-folder-tree-row-id]')?.dataset.folderTreeRowId ?? null;
}

function shouldIgnoreFolderTreeKeydown(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [data-folder-tree-ignore-keyboard]'));
}

export function FolderNavigator({
  actions,
  emptyState,
  entries,
  finderState,
  id,
  layout,
  scope,
  selection,
  status,
  tree,
}: FolderNavigatorProps) {
  return (
    <PanelShell
      id={id}
      focusZone="navigator"
      collapsed={layout.collapsed}
      width={layout.width}
      collapsedWidth={0}
      className="border-r border-border-default bg-background-muted"
    >
      {layout.collapsed ? null : (
        <ExpandedNavigator
          actions={actions}
          emptyState={emptyState}
          entries={entries}
          finderState={finderState}
          layout={layout}
          scope={scope}
          selection={selection}
          status={status}
          tree={tree}
        />
      )}
    </PanelShell>
  );
}

function ExpandedNavigator({
  actions,
  emptyState,
  entries,
  finderState,
  layout,
  scope,
  selection,
  status,
  tree,
}: Omit<FolderNavigatorProps, 'id'>) {
  const isFinderMode = isNoteFinderActive(finderState);
  const finderOptions = useMemo(() => getNoteFinderOptions(tree.allNotes), [tree.allNotes]);
  const tagIndex = useMemo(() => buildNoteTagIndex(tree.allNotes), [tree.allNotes]);
  const selectedConcreteFolder = selection.selectedFolderId && selection.selectedFolderId !== UNFILED_FOLDER_ID
    ? tree.nodesById.get(selection.selectedFolderId) ?? null
    : null;
  const selectedFolderForNoteMove = selection.selectedFolderId === UNFILED_FOLDER_ID
    ? tree.unfiled
    : selectedConcreteFolder;

  return (
    <>
      <NavigatorHeader
        actions={actions}
        isFinderMode={isFinderMode}
        scope={scope}
        selectedFolder={selectedConcreteFolder}
        status={status}
        resultCount={entries.length}
      />
      <NavigatorFilterBar
        actions={actions}
        finderOptions={finderOptions}
        finderState={finderState}
        selectedFolderId={selection.selectedFolderId}
        status={status}
        tagIndex={tagIndex}
      />
      <NavigatorContent
        actions={actions}
        emptyState={emptyState}
        entries={entries}
        finderState={finderState}
        isFinderMode={isFinderMode}
        layout={layout}
        selectedFolderForNoteMove={selectedFolderForNoteMove}
        selection={selection}
        status={status}
        tree={tree}
      />
    </>
  );
}

function NavigatorHeader({
  actions,
  isFinderMode,
  resultCount,
  scope,
  selectedFolder,
  status,
}: {
  actions: FolderNavigatorActions;
  isFinderMode: boolean;
  resultCount: number;
  scope: WorkspaceScope;
  selectedFolder: FolderTreeNode | null;
  status: FolderNavigatorStatus;
}) {
  const navigatorSubtitle = status.isLoading
    ? 'Loading…'
    : status.isFetching
      ? 'Syncing…'
      : isFinderMode
        ? `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`
        : `${resultCount} notes`;

  return (
    <PanelHeader
      title={scope.label}
      subtitle={navigatorSubtitle}
      className="px-3 py-2.5"
      actions={(
        <>
          <ToolbarIconButton
            actionId="refresh"
            onClick={actions.onRefresh}
            label="Refresh notes"
          >
            <RefreshCcw aria-hidden="true" className={cn('h-4 w-4', status.isFetching && 'animate-spin')} />
          </ToolbarIconButton>
          <ToolbarIconButton
            actionId="new-note"
            onClick={actions.onCreate}
            disabled={!status.canCreate || status.isCreating}
            label="Create note"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </ToolbarIconButton>
          <FolderActionsDropdown
            selectedFolder={selectedFolder}
            canCreate={status.canCreate && !status.isCreating}
            onCreateFolder={actions.onCreateFolder}
            onImportMarkdown={actions.onImportMarkdown}
            onRenameFolder={actions.onRenameFolder}
            onDeleteFolder={actions.onDeleteFolder}
            onOpenPalette={actions.onOpenPalette}
          />
          <ToolbarIconButton
            actionId="toggle-navigator"
            onClick={actions.onToggleCollapsed}
            aria-expanded={true}
            label="Collapse note navigator"
          >
            <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
          </ToolbarIconButton>
        </>
      )}
    />
  );
}

function NavigatorFilterBar({
  actions,
  finderOptions,
  finderState,
  selectedFolderId,
  status,
  tagIndex,
}: {
  actions: FolderNavigatorActions;
  finderOptions: ReturnType<typeof getNoteFinderOptions>;
  finderState: NoteFinderState;
  selectedFolderId: string | null;
  status: FolderNavigatorStatus;
  tagIndex: ReturnType<typeof buildNoteTagIndex>;
}) {
  const handleTagToggle = (tag: string) => {
    actions.onFinderStateChange({
      ...finderState,
      searchScope: 'workspace',
      tagFilters: finderState.tagFilters.includes(tag)
        ? finderState.tagFilters.filter((candidate) => candidate !== tag)
        : [tag],
    });
  };

  return (
    <div className="space-y-1 border-b border-border-default px-3 pb-2 pt-2">
      <NoteFinderToolbar
        state={finderState}
        selectedFolderId={selectedFolderId}
        options={finderOptions}
        onChange={actions.onFinderStateChange}
      />
      <TagBrowser
        tags={tagIndex}
        activeTags={finderState.tagFilters}
        isLoading={status.isLoading}
        onTagToggle={handleTagToggle}
      />

      {!status.hasToken ? (
        <button
          type="button"
          onClick={actions.onOpenSettings}
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-border-default bg-background-default px-3 py-2 text-left text-sm text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default',
            FOCUS_RING_CLASS,
          )}
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          <span>Configure HackMD API Token</span>
        </button>
      ) : null}

      <RepositoryNotice error={status.activeError} cached={status.showingCachedFallback} />
    </div>
  );
}

function NavigatorContent({
  actions,
  emptyState,
  entries,
  finderState,
  isFinderMode,
  layout,
  selectedFolderForNoteMove,
  selection,
  status,
  tree,
}: {
  actions: FolderNavigatorActions;
  emptyState: FolderNavigatorEmptyState;
  entries: FolderTreeNote[];
  finderState: NoteFinderState;
  isFinderMode: boolean;
  layout: FolderNavigatorLayout;
  selectedFolderForNoteMove: FolderTreeNode | null;
  selection: FolderNavigatorSelection;
  status: FolderNavigatorStatus;
  tree: FolderTree;
}) {
  const hasTreeContent = tree.roots.length > 0 || tree.unfiled.notes.length > 0;

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
      {status.isLoading ? (
        <NoteListSkeleton />
      ) : entries.length === 0 && (!hasTreeContent || isFinderMode) ? (
        <EmptyState
          icon={<FileText aria-hidden="true" className="h-7 w-7" />}
          title={emptyState.title}
          description={emptyState.description}
          action={(
            <NavigatorEmptyAction
              actions={actions}
              finderState={finderState}
              isFinderMode={isFinderMode}
              status={status}
            />
          )}
        />
      ) : isFinderMode ? (
        <FinderResultList
          actions={actions}
          entries={entries}
          selectedFolderForNoteMove={selectedFolderForNoteMove}
          selectedNoteId={selection.selectedNoteId}
        />
      ) : (
        <NavigatorTree
          actions={actions}
          layout={layout}
          selectedFolderForNoteMove={selectedFolderForNoteMove}
          selection={selection}
          status={status}
          tree={tree}
        />
      )}
    </div>
  );
}

function NavigatorEmptyAction({
  actions,
  finderState,
  isFinderMode,
  status,
}: {
  actions: FolderNavigatorActions;
  finderState: NoteFinderState;
  isFinderMode: boolean;
  status: FolderNavigatorStatus;
}) {
  if (!status.hasToken) {
    return (
      <button
        type="button"
        onClick={actions.onOpenSettings}
        className={cn(
          'inline-flex h-9 items-center justify-center rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover',
          FOCUS_RING_CLASS,
        )}
      >
        Configure Token
      </button>
    );
  }

  if (isFinderMode) {
    return (
      <button
        type="button"
        onClick={() => actions.onFinderStateChange(DEFAULT_NOTE_FINDER_STATE)}
        disabled={finderState === DEFAULT_NOTE_FINDER_STATE}
        className={cn(
          'inline-flex h-9 items-center justify-center rounded-md border border-border-default px-3 text-sm font-medium text-text-default transition-colors hover:bg-element-bg-hover disabled:pointer-events-none disabled:opacity-50',
          FOCUS_RING_CLASS,
        )}
      >
        Clear Filters
      </button>
    );
  }

  if (status.canCreate) {
    return (
      <button
        type="button"
        onClick={actions.onCreate}
        disabled={status.isCreating}
        className={cn(
          'inline-flex h-9 items-center justify-center rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50',
          FOCUS_RING_CLASS,
        )}
      >
        Create Note
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={actions.onRefresh}
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-md border border-border-default px-3 text-sm font-medium text-text-default transition-colors hover:bg-element-bg-hover',
        FOCUS_RING_CLASS,
      )}
    >
      Refresh
    </button>
  );
}

function FinderResultList({
  actions,
  entries,
  selectedFolderForNoteMove,
  selectedNoteId,
}: {
  actions: FolderNavigatorActions;
  entries: FolderTreeNote[];
  selectedFolderForNoteMove: FolderTreeNode | null;
  selectedNoteId: string | null;
}) {
  return (
    <div className="min-w-0 space-y-1">
      {entries.map((entry) => (
        <NoteRow
          key={`${entry.folderLabel}:${entry.note.id}`}
          entry={entry}
          selected={entry.note.id === selectedNoteId}
          onSelect={actions.onNoteSelect}
          onOpen={actions.onOpenNote}
          onCopyLink={actions.onCopyNoteLink}
          onCopyMarkdownLink={actions.onCopyNoteMarkdownLink}
          onDuplicate={actions.onDuplicateNote}
          onExportMarkdown={actions.onExportNoteMarkdown}
          onDelete={actions.onDeleteNote}
          onMoveToSelectedFolder={(noteEntry) => moveNoteToSelectedFolder(noteEntry, selectedFolderForNoteMove, actions.onNoteMove)}
          selectedFolder={selectedFolderForNoteMove}
        />
      ))}
    </div>
  );
}

function NavigatorTree({
  actions,
  layout,
  selectedFolderForNoteMove,
  selection,
  status,
  tree,
}: {
  actions: FolderNavigatorActions;
  layout: FolderNavigatorLayout;
  selectedFolderForNoteMove: FolderTreeNode | null;
  selection: FolderNavigatorSelection;
  status: FolderNavigatorStatus;
  tree: FolderTree;
}) {
  const treeRef = useRef<HTMLDivElement | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const visibleFolderItems = useMemo(
    () => flattenFolderTree(tree, layout.collapsedFolderIds),
    [layout.collapsedFolderIds, tree],
  );
  const focusItems = useMemo(
    () => getFolderTreeFocusItems(tree, layout.collapsedFolderIds),
    [layout.collapsedFolderIds, tree],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeNote = activeNoteId
    ? tree.allNotes.find((entry) => entry.note.id === activeNoteId) ?? null
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    const noteId = parseNoteDragId(activeId);
    if (noteId) {
      setActiveNoteId(noteId);
      setActiveFolderId(null);
      return;
    }

    setActiveFolderId(activeId);
    setActiveNoteId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveFolderId(null);
    setActiveNoteId(null);

    const noteOperation = buildNoteDropOperation({ tree, activeId, overId });
    if (noteOperation) {
      if (!status.isMovingNote) {
        actions.onNoteMove(noteOperation);
      }
      return;
    }

    if (!overId || activeId === overId || status.isMovingFolder) {
      return;
    }

    const projection = getProjectedFolderDrop({
      items: visibleFolderItems,
      activeId,
      overId,
      dragOffsetX: event.delta.x,
    });
    if (!projection) {
      return;
    }

    const operation = buildFolderDropOperation({
      tree,
      visibleItems: visibleFolderItems,
      activeId,
      overId,
      projection,
    });
    if (operation?.changed) {
      actions.onFolderDrop(operation);
    }
  };

  const handleDragCancel = () => {
    setActiveFolderId(null);
    setActiveNoteId(null);
  };

  const focusTreeItem = useCallback((itemId: string) => {
    const row = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[data-folder-tree-row-id]') ?? [])
      .find((candidate) => candidate.dataset.folderTreeRowId === itemId);
    const target = row?.querySelector<HTMLElement>('[data-folder-tree-primary="true"]')
      ?? row?.querySelector<HTMLElement>('button:not([disabled])');

    target?.focus();
  }, []);

  const focusItemAtIndex = useCallback((index: number) => {
    const item = focusItems[Math.max(0, Math.min(index, focusItems.length - 1))];
    if (item) {
      focusTreeItem(item.id);
    }
  }, [focusItems, focusTreeItem]);

  const handleTreeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (shouldIgnoreFolderTreeKeydown(event.target) || focusItems.length === 0) {
      return;
    }

    const isPlainKey = !event.metaKey && !event.altKey && !event.shiftKey;
    const isCtrlNext = event.ctrlKey && isPlainKey && event.key.toLowerCase() === 'n';
    const isCtrlPrevious = event.ctrlKey && isPlainKey && event.key.toLowerCase() === 'p';
    const currentRowId = getKeyboardFocusRowId(event.target);
    const currentIndex = currentRowId ? focusItems.findIndex((item) => item.id === currentRowId) : -1;
    const currentItem = currentIndex >= 0 ? focusItems[currentIndex] : null;

    if ((!event.ctrlKey && isPlainKey && event.key === 'ArrowDown') || isCtrlNext) {
      event.preventDefault();
      focusItemAtIndex(currentIndex >= 0 ? currentIndex + 1 : 0);
      return;
    }

    if ((!event.ctrlKey && isPlainKey && event.key === 'ArrowUp') || isCtrlPrevious) {
      event.preventDefault();
      focusItemAtIndex(currentIndex >= 0 ? currentIndex - 1 : focusItems.length - 1);
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'Home') {
      event.preventDefault();
      focusItemAtIndex(0);
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'End') {
      event.preventDefault();
      focusItemAtIndex(focusItems.length - 1);
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'ArrowRight' && currentItem?.kind === 'folder') {
      event.preventDefault();
      if (currentItem.folderId && currentItem.folderId !== UNFILED_FOLDER_ID && currentItem.hasChildren && layout.collapsedFolderIds.has(currentItem.folderId)) {
        actions.onFolderToggle(currentItem.folderId);
        return;
      }

      const nextItem = focusItems[currentIndex + 1];
      if (nextItem && nextItem.depth > currentItem.depth) {
        focusTreeItem(nextItem.id);
      }
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'ArrowLeft' && currentItem?.kind === 'folder') {
      event.preventDefault();
      if (currentItem.folderId && currentItem.folderId !== UNFILED_FOLDER_ID && currentItem.hasChildren && !layout.collapsedFolderIds.has(currentItem.folderId)) {
        actions.onFolderToggle(currentItem.folderId);
        return;
      }

      if (currentItem.folderId !== UNFILED_FOLDER_ID) {
        focusTreeItem(createFolderFocusId(currentItem.parentFolderId ?? UNFILED_FOLDER_ID));
      }
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'Enter' && currentItem) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const primaryAction = target?.dataset.folderTreePrimary === 'true'
        || currentItem.id === createFolderFocusId(UNFILED_FOLDER_ID);

      if (!primaryAction) {
        return;
      }

      event.preventDefault();
      if (currentItem.kind === 'folder' && currentItem.folderId) {
        actions.onFolderSelect(currentItem.folderId);
        return;
      }

      if (currentItem.kind === 'note' && currentItem.note) {
        actions.onNoteSelect(currentItem.note.note);
      }
    }
  }, [
    actions,
    focusItemAtIndex,
    focusItems,
    focusTreeItem,
    layout.collapsedFolderIds,
  ]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={visibleFolderItems.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={treeRef}
          className="grid min-w-0 gap-0.5"
          data-testid="folder-navigator-tree"
          onKeyDown={handleTreeKeyDown}
        >
          <RootFolderRow
            selected={selection.selectedFolderId === UNFILED_FOLDER_ID}
            focusTarget={selection.selectedFolderId === UNFILED_FOLDER_ID && !selection.selectedNoteId}
            noteCount={tree.unfiled.notes.length}
            folderDragActive={Boolean(activeFolderId)}
            noteDragActive={Boolean(activeNoteId)}
            onSelect={() => actions.onFolderSelect(UNFILED_FOLDER_ID)}
            onCreateFolder={() => actions.onCreateFolderInside(null)}
            onCreateNote={() => actions.onCreateNoteInside(null)}
          />
          <FolderTreeView
            nodes={tree.roots}
            selectedFolderId={selection.selectedFolderId}
            selectedNoteId={selection.selectedNoteId}
            collapsedFolderIds={layout.collapsedFolderIds}
            activeFolderId={activeFolderId}
            activeNoteId={activeNoteId}
            depth={0}
            onFolderSelect={actions.onFolderSelect}
            onFolderToggle={actions.onFolderToggle}
            onCreateFolderInside={actions.onCreateFolderInside}
            onCreateNoteInside={actions.onCreateNoteInside}
            onRenameFolder={actions.onRenameFolder}
            onDeleteFolder={actions.onDeleteFolder}
            onNoteSelect={actions.onNoteSelect}
            onNoteOpen={actions.onOpenNote}
            onNoteCopyLink={actions.onCopyNoteLink}
            onNoteCopyMarkdownLink={actions.onCopyNoteMarkdownLink}
            onNoteDuplicate={actions.onDuplicateNote}
            onNoteExportMarkdown={actions.onExportNoteMarkdown}
            onNoteDelete={actions.onDeleteNote}
            onNoteMoveToSelectedFolder={(entry) => moveNoteToSelectedFolder(entry, selectedFolderForNoteMove, actions.onNoteMove)}
            selectedFolderForNoteMove={selectedFolderForNoteMove}
            isMovingNote={status.isMovingNote}
          />
          {tree.unfiled.notes.map((entry) => (
            <NoteRow
              key={`root:${entry.note.id}`}
              entry={entry}
              selected={entry.note.id === selection.selectedNoteId}
              focusTarget={entry.note.id === selection.selectedNoteId}
              onSelect={actions.onNoteSelect}
              onOpen={actions.onOpenNote}
              onCopyLink={actions.onCopyNoteLink}
              onCopyMarkdownLink={actions.onCopyNoteMarkdownLink}
              onDuplicate={actions.onDuplicateNote}
              onExportMarkdown={actions.onExportNoteMarkdown}
              onDelete={actions.onDeleteNote}
              onMoveToSelectedFolder={(noteEntry) => moveNoteToSelectedFolder(noteEntry, selectedFolderForNoteMove, actions.onNoteMove)}
              selectedFolder={selectedFolderForNoteMove}
              draggable
              disabledDrag={status.isMovingNote}
              active={activeNoteId === entry.note.id}
              compact
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeNote ? (
          <NoteDragOverlay entry={activeNote} />
        ) : (
          <FolderDragOverlay node={activeFolderId ? tree.nodesById.get(activeFolderId) ?? null : null} />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function moveNoteToSelectedFolder(
  entry: FolderTreeNote,
  selectedFolderForNoteMove: FolderTreeNode | null,
  onNoteMove: (operation: NoteDropOperation) => void,
) {
  if (!selectedFolderForNoteMove) {
    return;
  }

  const targetFolderId = selectedFolderForNoteMove.id === UNFILED_FOLDER_ID ? null : selectedFolderForNoteMove.id;
  onNoteMove({
    note: entry,
    targetFolderId,
    changed: getNoteCurrentFolderId(entry) !== targetFolderId,
  });
}
