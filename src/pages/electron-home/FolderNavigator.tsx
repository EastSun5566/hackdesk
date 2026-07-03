import {
  AlertCircle,
  FileText,
  PanelLeftClose,
  Plus,
  RefreshCcw,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useFolderTreeKeyboardNavigation } from './useFolderTreeKeyboardNavigation';

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
  hasLocalVault: boolean;
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
  onChooseLocalVault: () => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onDuplicateNote: (note: NoteSummary) => void;
  onExportNoteMarkdown: (note: NoteSummary) => void;
  onFinderStateChange: (state: NoteFinderState) => void;
  onFolderDrop: (operation: FolderDropOperation) => void;
  onFolderSelect: (folderId: string | null) => void;
  onFolderToggle: (folderId: string) => void;
  onFolderRevealInFinder: (folderId: string) => void;
  onImportMarkdown: () => void;
  onNoteMove: (operation: NoteDropOperation) => void;
  onNoteSelect: (note: NoteSummary) => void;
  onNoteRevealInFinder: (note: NoteSummary) => void;
  onOpenNote: (note: NoteSummary) => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onRevealNoteFolder: (entry: FolderTreeNote) => void;
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
  const [treeFocusRequestId, setTreeFocusRequestId] = useState(0);
  const requestTreeFocus = () => setTreeFocusRequestId((current) => current + 1);

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
        scope={scope}
        selectedFolderId={selection.selectedFolderId}
        status={status}
        tagIndex={tagIndex}
        onEscapeToTree={requestTreeFocus}
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
        scope={scope}
        status={status}
        tree={tree}
        treeFocusRequestId={treeFocusRequestId}
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
      actionsLabel="Note navigator actions"
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
            tooltip={!status.canCreate ? 'Connect HackMD to create notes.' : status.isCreating ? 'Creating note…' : undefined}
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
  scope,
  selectedFolderId,
  status,
  tagIndex,
  onEscapeToTree,
}: {
  actions: FolderNavigatorActions;
  finderOptions: ReturnType<typeof getNoteFinderOptions>;
  finderState: NoteFinderState;
  scope: WorkspaceScope;
  selectedFolderId: string | null;
  status: FolderNavigatorStatus;
  tagIndex: ReturnType<typeof buildNoteTagIndex>;
  onEscapeToTree: () => void;
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
    <div className="space-y-1 border-b border-border-default px-3 pb-1.5 pt-2">
      <NoteFinderToolbar
        state={finderState}
        selectedFolderId={selectedFolderId}
        options={finderOptions}
        onChange={actions.onFinderStateChange}
        onEscapeToTree={onEscapeToTree}
      />
      <TagBrowser
        tags={tagIndex}
        activeTags={finderState.tagFilters}
        isLoading={status.isLoading}
        onTagToggle={handleTagToggle}
      />

      {scope.type !== 'local' && !status.hasToken ? (
        <button
          type="button"
          onClick={actions.onOpenSettings}
          className={cn(
            'flex w-full items-center gap-2 rounded-[6px] border border-border-default bg-background-default px-2.5 py-1.5 text-left text-xs text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default',
            FOCUS_RING_CLASS,
          )}
        >
          <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">Configure HackMD API Token</span>
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
  scope,
  status,
  tree,
  treeFocusRequestId,
}: {
  actions: FolderNavigatorActions;
  emptyState: FolderNavigatorEmptyState;
  entries: FolderTreeNote[];
  finderState: NoteFinderState;
  isFinderMode: boolean;
  layout: FolderNavigatorLayout;
  selectedFolderForNoteMove: FolderTreeNode | null;
  selection: FolderNavigatorSelection;
  scope: WorkspaceScope;
  status: FolderNavigatorStatus;
  tree: FolderTree;
  treeFocusRequestId: number;
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
              scope={scope}
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
          treeFocusRequestId={treeFocusRequestId}
        />
      )}
    </div>
  );
}

function NavigatorEmptyAction({
  actions,
  finderState,
  isFinderMode,
  scope,
  status,
}: {
  actions: FolderNavigatorActions;
  finderState: NoteFinderState;
  isFinderMode: boolean;
  scope: WorkspaceScope;
  status: FolderNavigatorStatus;
}) {
  if (scope.type === 'local' && !status.hasLocalVault) {
    return (
      <button
        type="button"
        onClick={actions.onChooseLocalVault}
        className={cn(
          'inline-flex h-9 items-center justify-center rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover',
          FOCUS_RING_CLASS,
        )}
      >
        Open Local Vault
      </button>
    );
  }

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
    <ul className="m-0 min-w-0 list-none space-y-1 p-0" aria-label="Search results">
      {entries.map((entry) => (
        <li key={`${entry.folderLabel}:${entry.note.id}`} className="min-w-0">
          <NoteRow
            entry={entry}
            selected={entry.note.id === selectedNoteId}
            onSelect={actions.onNoteSelect}
            onOpen={actions.onOpenNote}
            onCopyLink={actions.onCopyNoteLink}
            onCopyMarkdownLink={actions.onCopyNoteMarkdownLink}
            onDuplicate={actions.onDuplicateNote}
            onExportMarkdown={actions.onExportNoteMarkdown}
            onDelete={actions.onDeleteNote}
            onRevealFolder={actions.onRevealNoteFolder}
            onRevealInFinder={actions.onNoteRevealInFinder}
            onMoveToSelectedFolder={(noteEntry) => moveNoteToSelectedFolder(noteEntry, selectedFolderForNoteMove, actions.onNoteMove)}
            selectedFolder={selectedFolderForNoteMove}
          />
        </li>
      ))}
    </ul>
  );
}

function NavigatorTree({
  actions,
  layout,
  selectedFolderForNoteMove,
  selection,
  status,
  tree,
  treeFocusRequestId,
}: {
  actions: FolderNavigatorActions;
  layout: FolderNavigatorLayout;
  selectedFolderForNoteMove: FolderTreeNode | null;
  selection: FolderNavigatorSelection;
  status: FolderNavigatorStatus;
  tree: FolderTree;
  treeFocusRequestId: number;
}) {
  const treeRef = useRef<HTMLDivElement | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const visibleFolderItems = useMemo(
    () => flattenFolderTree(tree, layout.collapsedFolderIds),
    [layout.collapsedFolderIds, tree],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeNote = activeNoteId
    ? tree.allNotes.find((entry) => entry.note.id === activeNoteId) ?? null
    : null;
  useFolderTreeKeyboardNavigation({
    actions,
    collapsedFolderIds: layout.collapsedFolderIds,
    tree,
    treeRef,
  });

  useEffect(() => {
    if (treeFocusRequestId === 0) {
      return;
    }

    const target = treeRef.current?.querySelector<HTMLElement>('[data-hackdesk-focus-target="true"]')
      ?? treeRef.current?.querySelector<HTMLElement>('[data-folder-tree-primary="true"]')
      ?? treeRef.current?.querySelector<HTMLElement>('button:not([disabled])');
    target?.focus();
  }, [treeFocusRequestId]);

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
        >
          <ul className="m-0 grid min-w-0 list-none gap-0.5 p-0" aria-label="Folders and notes">
            <li className="min-w-0">
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
            </li>
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
              onFolderRevealInFinder={actions.onFolderRevealInFinder}
              onNoteSelect={actions.onNoteSelect}
              onNoteOpen={actions.onOpenNote}
              onNoteCopyLink={actions.onCopyNoteLink}
              onNoteCopyMarkdownLink={actions.onCopyNoteMarkdownLink}
              onNoteDuplicate={actions.onDuplicateNote}
              onNoteExportMarkdown={actions.onExportNoteMarkdown}
              onNoteDelete={actions.onDeleteNote}
              onNoteRevealFolder={actions.onRevealNoteFolder}
              onNoteRevealInFinder={actions.onNoteRevealInFinder}
              onNoteMoveToSelectedFolder={(entry) => moveNoteToSelectedFolder(entry, selectedFolderForNoteMove, actions.onNoteMove)}
              selectedFolderForNoteMove={selectedFolderForNoteMove}
              isMovingNote={status.isMovingNote}
              isMovingFolder={status.isMovingFolder}
            />
            {tree.unfiled.notes.map((entry) => (
              <li key={`root:${entry.note.id}`} className="min-w-0">
                <NoteRow
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
                  onRevealFolder={actions.onRevealNoteFolder}
                  onRevealInFinder={actions.onNoteRevealInFinder}
                  onMoveToSelectedFolder={(noteEntry) => moveNoteToSelectedFolder(noteEntry, selectedFolderForNoteMove, actions.onNoteMove)}
                  selectedFolder={selectedFolderForNoteMove}
                  draggable
                  disabledDrag={status.isMovingNote}
                  active={activeNoteId === entry.note.id}
                  compact
                />
              </li>
            ))}
          </ul>
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
