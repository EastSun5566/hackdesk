import {
  AlertCircle,
  FileText,
  History,
  Loader2,
  Search,
} from 'lucide-react';
import { createContext, memo, useContext, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable';

import { Button } from '@/components/ui/button';
import type { NoteSummary } from '@/lib/electron-api';
import type { LocalVaultSkippedFile } from '@/lib/local-vault';
import {
  buildFolderDropOperation,
  flattenFolderTree,
  getFolderDropPlacement,
  getPlacedFolderDrop,
  getProjectedFolderDrop,
  ROOT_FOLDER_DROP_ID,
  type FolderDropOperation,
  type FolderDropPlacement,
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
import { arePanelPropsEqual, useStableCallbacks } from '@/lib/stable-props';
import { useScrollOverflow } from './useScrollOverflow';

import { applyTreeGuides } from './tree-guides-preference';
import { cn } from '@/lib/utils';
import { HACK_MODE_HIDDEN_CLASS } from './ui';

import { EmptyState, PanelHeader, PanelShell } from './interaction-primitives';
import type { WorkspaceScope } from './types';
import { NOTE_FINDER_RESULTS_ID, NoteFilterChips, NoteSearchField, NoteViewOptionsMenu, type NoteFinderResults } from './FolderNavigatorFinder';
import {
  FolderDragOverlay,
  FolderTreeView,
  NoteDragOverlay,
  NoteListSkeleton,
  NoteRow,
  TREE_CHILDREN_INDENT_CLASS,
  TreeBlankArea,
  SidebarTrashRow,
  TREE_GUIDE_CLASS,
  treeItemClassName,
  WorkspaceRootScopeIcon,
  WorkspaceRootTreeRow,
} from './FolderNavigatorRows';
import { RepositoryNotice } from './RepositoryNotice';
import { SkippedFilesNotice } from './SkippedFilesNotice';
import { WORKSPACE_ROOT_FOCUS_ID } from './folder-tree-focus';
import { getScopeStorageKey } from './repository';
import { readRootSectionExpanded, writeRootSectionExpanded } from './workspace-root-section-preference';
import { trashNavigatorRowLabel, workspaceRootLabel } from './workspace-root-labels';
import { FolderTreeFocusContext } from './FolderTreeFocusContext';
import { useFolderTreeKeyboardNavigation } from './useFolderTreeKeyboardNavigation';
import { SidebarFooter, WorkspaceSwitcher, type WorkspaceSidebarProps } from './WorkspaceSwitcher';
import type { NoteTextSearch } from './useNoteTextSearch';
import { TrashNavigatorHeader, TrashNavigatorList, type TrashNavigatorViewProps } from './TrashView';
import { trashTeamPathForScope, useTrashList } from './useTrash';

/**
 * A pointer drop lands on the row under the pointer, found by where each row is on screen now.
 * dnd-kit's remembered positions go stale during a drag: the dragged folder's contents fold away
 * as it starts, moving every row below, and the workspace row stays pinned while the tree scrolls
 * under it. The workspace row is checked first, since rows scroll beneath it. Keyboard drags have
 * no pointer and step through the nearest rows.
 */
const treeCollisionDetection: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates;
  if (!pointer) {
    return closestCenter(args).filter((collision) => collision.id !== ROOT_FOLDER_DROP_ID);
  }
  const containers = [...args.droppableContainers].sort((left, right) => (
    Number(right.id === ROOT_FOLDER_DROP_ID) - Number(left.id === ROOT_FOLDER_DROP_ID)
  ));
  for (const container of containers) {
    if (container.disabled) continue;
    const bounds = container.node.current?.getBoundingClientRect();
    if (bounds && bounds.height > 0
      && pointer.x >= bounds.left && pointer.x <= bounds.right
      && pointer.y >= bounds.top && pointer.y <= bounds.bottom) {
      return [{ id: container.id }];
    }
  }
  return [];
};

/**
 * A pointer drag leaves the other folders in place and marks where the folder would land (see
 * FolderButton); only keyboard drags slide the rows apart to preview the new order.
 */
const POINTER_FOLDER_SORTING: SortingStrategy = () => null;

/**
 * The drag preview follows the pointer from just below and to the right of it, like a cursor
 * badge, so the row being dropped on stays in sight with its drop mark. Keyboard drags keep it
 * over the moving row.
 */
const PREVIEW_BESIDE_POINTER: Modifier = ({ transform, activatorEvent, draggingNodeRect }) => {
  if (!(activatorEvent instanceof PointerEvent) || !draggingNodeRect) return transform;
  return {
    ...transform,
    x: transform.x + activatorEvent.clientX - draggingNodeRect.left + 12,
    y: transform.y + activatorEvent.clientY - draggingNodeRect.top + 12,
  };
};
const PREVIEW_MODIFIERS = [PREVIEW_BESIDE_POINTER];

type FolderDropIndicator = { overId: string; placement: FolderDropPlacement; row: HTMLElement };

// Search input updates the root menu, not the memoized tree and its drag context.
const TreeViewOptionsContext = createContext<ComponentProps<typeof NoteViewOptionsMenu> | null>(null);

function TreeViewOptions({ tabIndex }: { tabIndex?: number }) {
  const props = useContext(TreeViewOptionsContext);
  return props ? <NoteViewOptionsMenu {...props} tabIndex={tabIndex} treeControl /> : null;
}

function TrashNavigatorTitleBar({ trash }: { trash: TrashNavigatorViewProps }) {
  const teamPath = trashTeamPathForScope(trash.scope);
  const list = useTrashList(trash.open && teamPath !== undefined, teamPath ?? null);
  const count = list.isSuccess ? list.data?.length : undefined;
  return <TrashNavigatorHeader count={count} onBack={() => trash.onOpenChange(false)} />;
}

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
  skippedFiles?: LocalVaultSkippedFile[];
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
  /** Absent where templates aren't available. */
  onCreateFromTemplate?: () => void;
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
  /** Notes whose text matched the finder query, with snippets. */
  textSearch?: NoteTextSearch;
  tree: FolderTree;
  trash?: TrashNavigatorViewProps;
  /** The workspace switcher in the title and the account row at the bottom. */
  workspace: WorkspaceSidebarProps;
};

/**
 * The sidebar re-renders only when its data changes. The workbench rebuilds these props on every
 * keystroke in the editor, and re-rendering every note row (each with its menu, hover card and drag
 * hooks) cost ~200ms a key; callbacks go through stable wrappers so skipped renders stay correct.
 */
export function FolderNavigator(props: FolderNavigatorProps) {
  useEffect(() => applyTreeGuides(), []);
  const actions = useStableCallbacks(props.actions);
  const workspace = useStableCallbacks(props.workspace);
  // Its callbacks are rebuilt each render too (openTrashNote is inline), which would defeat the memo.
  const trash = useStableCallbacks(props.trash ?? NO_TRASH);
  return <MemoFolderNavigator {...props} actions={actions} workspace={workspace} trash={props.trash ? trash as TrashNavigatorViewProps : undefined} />;
}

const NO_TRASH = {};

const MemoFolderNavigator = memo(FolderNavigatorPanel, arePanelPropsEqual);

function FolderNavigatorPanel({
  actions,
  emptyState,
  entries,
  finderState,
  id,
  layout,
  scope,
  selection,
  status,
  textSearch,
  tree,
  trash,
  workspace,
}: FolderNavigatorProps) {
  return (
    <PanelShell
      id={id}
      as="aside"
      ariaLabel="Sidebar"
      focusZone="navigator"
      collapsed={layout.collapsed}
      width={layout.width}
      collapsedWidth={0}
      className={cn('note-navigator bg-background-muted', HACK_MODE_HIDDEN_CLASS)}
      // On the panel, not the content, so the resize handle can update both widths while dragging.
      style={{ '--sidebar-content-width': `${layout.width}px` } as CSSProperties}
    >
      {/* Stays mounted at its full width while collapsed, so the panel clips it as the width
          animates instead of reflowing it every frame. */}
      <div className="scroll-edges flex min-h-0 w-(--sidebar-content-width) flex-1 shrink-0 flex-col">
        <ExpandedNavigator
          actions={actions}
          emptyState={emptyState}
          entries={entries}
          finderState={finderState}
          layout={layout}
          scope={scope}
          selection={selection}
          status={status}
          textSearch={textSearch}
          tree={tree}
          trash={trash}
          workspace={workspace}
        />
        {/* Pinned above the account row rather than at the end of the tree, so a long workspace
            never pushes it out of reach. Search hides it with the tree. */}
        {trash && (scope.type === 'personal' || scope.type === 'team') && !isNoteFinderActive(finderState) ? (
          // No rule: the list above fades out at its edge while it scrolls, which separates enough.
          <div className="mx-2 shrink-0 pt-1">
            <SidebarTrashRow
              label={trashNavigatorRowLabel(scope)}
              selected={Boolean(trash.open)}
              onOpen={() => trash.onOpenChange(true)}
            />
          </div>
        ) : null}
        <SidebarFooter accountStatus={workspace.accountStatus} user={workspace.user} onOpenSettings={workspace.onOpenSettings} onSignOut={workspace.onSignOut} />
      </div>
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
  textSearch,
  tree,
  trash,
  workspace,
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
  // The highlighted result follows the search box's arrow keys and starts over when results change.
  const resultsKey = entries.map((entry) => entry.note.id).join('\n');
  const [highlight, setHighlight] = useState({ key: '', index: 0 });
  const highlightedIndex = isFinderMode && entries.length ? (highlight.key === resultsKey ? highlight.index : 0) : -1;
  const highlightedEntry = highlightedIndex >= 0 ? entries[highlightedIndex] : undefined;
  const results: NoteFinderResults | undefined = isFinderMode ? {
    activeId: highlightedEntry ? finderResultId(highlightedEntry) : undefined,
    announcement: highlightedEntry
      ? `${highlightedEntry.note.title || 'Untitled'}, ${highlightedIndex + 1} of ${entries.length}. Enter opens it.`
      : '',
    count: entries.length,
    move: (step) => {
      if (!entries.length) return;
      setHighlight({ key: resultsKey, index: (Math.max(highlightedIndex, 0) + step + entries.length) % entries.length });
    },
    open: () => { if (highlightedEntry) actions.onNoteSelect(highlightedEntry.note); },
  } : undefined;

  return (
    <>
      <NavigatorHeader
        workspace={workspace}
        status={status}
        search={(
          <NoteSearchField
            state={finderState}
            onChange={actions.onFinderStateChange}
            results={results}
            onEscapeToTree={requestTreeFocus}
          />
        )}
      />
      <NavigatorFilterBar actions={actions} scope={scope} status={status} />
      {trash?.open ? <TrashNavigatorTitleBar trash={trash} /> : null}
      {/* A flat list (results, a changed view, or History) has no root row to hold View options,
          so it gets a header row of its own in the same place. */}
      {!trash?.open && (isFinderMode || scope.type === 'history') ? (
        <>
          {/* Icon and label on the same columns as the root row it stands in for. */}
          <div className="flex h-8 shrink-0 items-center gap-1.5 px-4 text-sm text-text-subtle">
            <span aria-hidden="true" className="flex w-3.5 shrink-0 justify-center text-icon-subtle">
              {finderState.query.trim() ? <Search className="h-3.5 w-3.5" /> : scope.type === 'history' ? <History className="h-3.5 w-3.5" /> : <WorkspaceRootScopeIcon scope={scope} />}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {finderState.query.trim() ? 'Results' : scope.type === 'history' ? 'History' : (workspaceRootLabel(scope) ?? 'Notes')}
            </span>
            {results ? (
              <span className="shrink-0 text-xs tabular-nums">{`${results.count} ${results.count === 1 ? 'result' : 'results'}`}</span>
            ) : null}
            <NoteViewOptionsMenu
              state={finderState}
              selectedFolderId={selection.selectedFolderId}
              options={finderOptions}
              onChange={actions.onFinderStateChange}
              tags={tagIndex}
              className="-mr-1.5"
            />
          </div>
          <NoteFilterChips state={finderState} onChange={actions.onFinderStateChange} />
        </>
      ) : null}
      <MemoNavigatorContent
        actions={actions}
        emptyState={emptyState}
        entries={entries}
        finderState={finderState}
        finderOptions={finderOptions}
        tagIndex={tagIndex}
        isFinderMode={isFinderMode}
        highlightedResultId={results?.activeId}
        layout={layout}
        selectedFolderForNoteMove={selectedFolderForNoteMove}
        selection={selection}
        scope={scope}
        status={status}
        textSearch={textSearch}
        tree={tree}
        trash={trash}
        treeFocusRequestId={treeFocusRequestId}
      />
    </>
  );
}

function NavigatorHeader({
  status,
  workspace,
  search,
}: {
  status: FolderNavigatorStatus;
  workspace: WorkspaceSidebarProps;
  /** The search field: an icon at the row's end that opens across the row. */
  search: ReactNode;
}) {
  // Status sits in the action row, so the header keeps one height: a spinner while the list loads
  // or syncs. The result count shows in the search field, so typing never squeezes the name.
  const busyLabel = status.isLoading ? 'Loading notes…' : status.isFetching ? 'Syncing notes…' : undefined;

  return (
    <PanelHeader
      title={(
        <div className="relative flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1"><WorkspaceSwitcher {...workspace} /></div>
          {/* A fixed slot beside search, so the spinner never moves anything when it appears. */}
          <span className="flex size-6 shrink-0 items-center justify-center text-icon-subtle">
            {busyLabel ? (
              <span role="status" aria-label={busyLabel} title={busyLabel}>
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
              </span>
            ) : null}
          </span>
          {search}
        </div>
      )}
      titleElement="div"
      // 12px below, against 8px between search and New Note, so the workspace reads as its own group
      // above the find-and-create group.
      className="px-4 pb-3 pt-2.5"
      // Icon buttons carry 8px of padding, so pulling them out by 8px puts their glyphs on the
      // same 16px edge as the rest of the sidebar.
      // No action buttons: search, and the sync spinner beside it, are in the title row. Folder
      // actions live in each folder's context menu, creating and view options on the workspace row,
      // the command palette is a keyboard path (⌘K), and lists refresh on window focus.
    />
  );
}

function NavigatorFilterBar({
  actions,
  scope,
  status,
}: {
  actions: FolderNavigatorActions;
  scope: WorkspaceScope;
  status: FolderNavigatorStatus;
}) {
  return (
    // Only notices live here now; with none, it takes no space.
    <div className="space-y-1 px-2 pb-2 empty:hidden">
      {scope.type !== 'local' && !status.hasToken ? (
        <Button
          size="sm"
          onClick={actions.onOpenSettings}
          className="w-full justify-start font-normal text-text-subtle hover:text-text-default"
        >
          <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">Configure HackMD API Token</span>
        </Button>
      ) : null}

      <RepositoryNotice error={status.activeError} cached={status.showingCachedFallback} />
      {scope.type === 'local' ? <SkippedFilesNotice files={status.skippedFiles} /> : null}
    </div>
  );
}

// The note list re-renders only on its own data: opening the workspace switcher or typing in the
// header must not re-render every row.
const MemoNavigatorContent = memo(function NavigatorContent({
  actions,
  emptyState,
  entries,
  finderState,
  finderOptions,
  tagIndex,
  isFinderMode,
  highlightedResultId,
  layout,
  selectedFolderForNoteMove,
  selection,
  scope,
  status,
  textSearch,
  tree,
  trash,
  treeFocusRequestId,
}: {
  actions: FolderNavigatorActions;
  emptyState: FolderNavigatorEmptyState;
  entries: FolderTreeNote[];
  finderState: NoteFinderState;
  finderOptions: ReturnType<typeof getNoteFinderOptions>;
  tagIndex: ReturnType<typeof buildNoteTagIndex>;
  isFinderMode: boolean;
  highlightedResultId?: string;
  layout: FolderNavigatorLayout;
  selectedFolderForNoteMove: FolderTreeNode | null;
  selection: FolderNavigatorSelection;
  scope: WorkspaceScope;
  status: FolderNavigatorStatus;
  textSearch?: NoteTextSearch;
  tree: FolderTree;
  trash?: TrashNavigatorViewProps;
  treeFocusRequestId: number;
}) {
  const hasTreeContent = tree.roots.length > 0 || tree.unfiled.notes.length > 0;
  const trashActive = Boolean(trash?.open);
  // The pinned workspace row (8px of cover plus its 32px row) stays solid; rows fade under it.
  const pinnedRootShown = !trashActive && !isFinderMode && !status.isLoading && scope.type !== 'history' && hasTreeContent;
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const overflow = useScrollOverflow(scroller, 'y');

  return (
    // While the workspace row is pinned, rows scrolled into view (keyboard, reveal, hints) stop
    // below it instead of under it: 2.5rem is its 8px cover plus its 32px row.
    <div
      ref={setScroller}
      data-overflow-start={overflow.start || undefined}
      data-overflow-end={overflow.end || undefined}
      className={cn('scroll-edges-source min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2', pinnedRootShown && 'scroll-pt-10')}
    >
      {/* Edge fades (see .edge-fade-top in styles.css): zero-height, so they never move the rows.
          Each shows only while rows lie past its edge, so a list that fits shows neither. */}
      <div aria-hidden="true" className={cn('edge-fade-top pointer-events-none sticky z-10 -mx-2 h-0', pinnedRootShown ? 'top-8' : '-top-2')}>
        <div className="h-8 bg-linear-to-b from-background-muted to-transparent" />
      </div>
      {trashActive && trash ? (
        <TrashNavigatorList
          open={trash.open}
          onOpenChange={trash.onOpenChange}
          onOpenNote={trash.onOpenNote}
          scope={trash.scope}
        />
      ) : status.isLoading ? (
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
          highlightedResultId={highlightedResultId}
          selectedFolderForNoteMove={selectedFolderForNoteMove}
          selectedNoteId={selection.selectedNoteId}
          textSearch={finderState.query.trim() ? textSearch : undefined}
        />
      ) : scope.type === 'history' ? (
        <HistoryList
          actions={actions}
          entries={tree.allNotes}
          selectedFolderForNoteMove={selectedFolderForNoteMove}
          selectedNoteId={selection.selectedNoteId}
        />
      ) : null}
      {/* The tree stays mounted (hidden) while search results show: rebuilding hundreds of rows
          when the search clears was the slowest keystroke. */}
      {!trashActive && !status.isLoading && scope.type !== 'history' && hasTreeContent ? (
        <div hidden={isFinderMode}>
          <TreeViewOptionsContext.Provider value={{
            state: finderState,
            selectedFolderId: selection.selectedFolderId,
            options: finderOptions,
            onChange: actions.onFinderStateChange,
            tags: tagIndex,
          }}>
            <MemoNavigatorTree
              actions={actions}
              layout={layout}
              scope={scope}
              selectedFolderForNoteMove={selectedFolderForNoteMove}
              selection={selection}
              status={status}
              tree={tree}
              treeFocusRequestId={treeFocusRequestId}
            />
          </TreeViewOptionsContext.Provider>
        </div>
      ) : null}
      <div aria-hidden="true" className="edge-fade-bottom pointer-events-none sticky -bottom-2 z-10 -mx-2 h-0">
        <div className="absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-background-muted to-transparent" />
      </div>
    </div>
  );
}, arePanelPropsEqual);

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
      <Button
        variant="primary"
        onClick={actions.onChooseLocalVault}
      >
        Open Local Vault
      </Button>
    );
  }

  if (!status.hasToken) {
    return (
      <Button
        variant="primary"
        onClick={actions.onOpenSettings}
      >
        Configure Token
      </Button>
    );
  }

  if (isFinderMode) {
    return (
      <Button
        onClick={() => actions.onFinderStateChange(DEFAULT_NOTE_FINDER_STATE)}
        disabled={finderState === DEFAULT_NOTE_FINDER_STATE}
      >
        Clear Filters
      </Button>
    );
  }

  if (status.canCreate) {
    return (
      <Button
        variant="primary"
        onClick={actions.onCreate}
        disabled={status.isCreating}
      >
        Create Note
      </Button>
    );
  }

  return (
    <Button onClick={actions.onRefresh}>
      Refresh
    </Button>
  );
}

function finderResultId(entry: FolderTreeNote) {
  return `note-finder-result-${entry.note.id}`;
}

/**
 * History is a time order, not a place, so it lists notes most recent first instead of nesting
 * them in folders. Each row's hover card names its workspace folder.
 */
function HistoryList({
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
    <ul className="m-0 grid min-w-0 list-none gap-0.5 p-0" aria-label="Recently opened notes">
      {entries.map((entry) => (
        <li key={`history:${entry.note.id}`} className="min-w-0">
          <NoteRow
            entry={entry}
            selected={entry.note.id === selectedNoteId}
            focusTarget={entry.note.id === selectedNoteId}
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
            showInFolderAction
            compact
          />
        </li>
      ))}
    </ul>
  );
}

const RESULT_BATCH_SIZE = 50;

function FinderResultList({
  actions,
  entries,
  highlightedResultId,
  selectedFolderForNoteMove,
  selectedNoteId,
  textSearch,
}: {
  actions: FolderNavigatorActions;
  entries: FolderTreeNote[];
  highlightedResultId?: string;
  selectedFolderForNoteMove: FolderTreeNode | null;
  selectedNoteId: string | null;
  textSearch?: NoteTextSearch;
}) {
  // Results render in batches: a one-letter search can match hundreds of notes, and mounting them
  // all at once made that keystroke slow. More load as the end scrolls near; the keyboard-highlighted
  // result is always rendered so arrow keys and End can reach it.
  const [batch, setBatch] = useState({ entries, limit: RESULT_BATCH_SIZE });
  if (batch.entries !== entries) setBatch({ entries, limit: RESULT_BATCH_SIZE });
  const highlightedIndex = highlightedResultId ? entries.findIndex((entry) => finderResultId(entry) === highlightedResultId) : -1;
  const shownCount = Math.min(entries.length, Math.max(batch.limit, highlightedIndex + 1));
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) {
        setBatch((current) => ({ ...current, limit: current.limit + RESULT_BATCH_SIZE }));
      }
    }, { rootMargin: '240px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [shownCount]);

  useEffect(() => {
    if (highlightedResultId) document.getElementById(highlightedResultId)?.scrollIntoView({ block: 'nearest' });
  }, [highlightedResultId]);

  return (
    <>
      <ul id={NOTE_FINDER_RESULTS_ID} className="m-0 min-w-0 list-none space-y-1 p-0" aria-label="Search results">
        {entries.slice(0, shownCount).map((entry) => (
          <li key={`${entry.folderLabel}:${entry.note.id}`} className="min-w-0">
            <NoteRow
              entry={entry}
              highlightId={finderResultId(entry) === highlightedResultId ? highlightedResultId : undefined}
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
              showInFolderAction
              snippet={textSearch?.matches.get(entry.note.id)}
            />
          </li>
        ))}
        {shownCount < entries.length ? <li ref={sentinelRef} aria-hidden="true" className="h-px" /> : null}
      </ul>
      {textSearch?.source === 'hackmd' ? (
        // HackMD note text is known only for notes opened on this computer.
        <p className="px-2 pt-3 text-xs text-text-subtle">
          {`Searched the text of ${textSearch.indexedCount} ${textSearch.indexedCount === 1 ? 'note' : 'notes'} you've opened.`}
        </p>
      ) : null}
    </>
  );
}

const MemoNavigatorTree = memo(NavigatorTree, arePanelPropsEqual);

function NavigatorTree({
  actions,
  layout,
  scope,
  selectedFolderForNoteMove,
  selection,
  status,
  tree,
  treeFocusRequestId,
}: {
  actions: FolderNavigatorActions;
  layout: FolderNavigatorLayout;
  scope: WorkspaceScope;
  selectedFolderForNoteMove: FolderTreeNode | null;
  selection: FolderNavigatorSelection;
  status: FolderNavigatorStatus;
  tree: FolderTree;
  treeFocusRequestId: number;
}) {
  const treeRef = useRef<HTMLDivElement | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [keyboardFolderDrag, setKeyboardFolderDrag] = useState(false);
  // Pointer folder drags: where the pointer is, and the row marked as the drop target. Both live
  // outside React state; the mark is a data attribute, so moving the pointer re-renders nothing.
  const pointerYRef = useRef<number | null>(null);
  const stopPointerTrackingRef = useRef<(() => void) | null>(null);
  const folderDropRef = useRef<FolderDropIndicator | null>(null);
  const visibleFolderItems = useMemo(
    () => flattenFolderTree(tree, layout.collapsedFolderIds),
    [layout.collapsedFolderIds, tree],
  );
  // One array per distinct list of IDs: SortableContext treats a new array as a new list and
  // re-renders every sortable folder row, which made each expand and collapse re-render them all.
  const sortableFolderKey = visibleFolderItems.map((item) => item.id).join('\n');
  const sortableFolderIds = useMemo(() => (sortableFolderKey ? sortableFolderKey.split('\n') : []), [sortableFolderKey]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeNote = activeNoteId
    ? tree.allNotes.find((entry) => entry.note.id === activeNoteId) ?? null
    : null;
  const treeId = useId();
  const workspaceChildrenGroupId = `${treeId}-workspace-children`;
  const rootLabel = workspaceRootLabel(scope) ?? 'My Notes';
  const showRootRow = scope.type !== 'history';
  const scopeStorageKey = getScopeStorageKey(scope);
  const [rootSectionExpanded, setRootSectionExpanded] = useState(() => (
    scopeStorageKey ? readRootSectionExpanded(scopeStorageKey) : true
  ));
  useEffect(() => {
    if (scopeStorageKey) {
      setRootSectionExpanded(readRootSectionExpanded(scopeStorageKey));
    }
  }, [scopeStorageKey]);
  const toggleRootSection = () => {
    setRootSectionExpanded((previous) => {
      const next = !previous;
      if (scopeStorageKey) writeRootSectionExpanded(scopeStorageKey, next);
      return next;
    });
  };
  const rootSelected = !selection.selectedNoteId
    && (selection.selectedFolderId === UNFILED_FOLDER_ID || selection.selectedFolderId === null);
  const selectedRowId = selection.selectedNoteId
      ? `note:${selection.selectedNoteId}`
      : selection.selectedFolderId && selection.selectedFolderId !== UNFILED_FOLDER_ID
        ? `folder:${selection.selectedFolderId}`
        : showRootRow
          ? WORKSPACE_ROOT_FOCUS_ID
          : null;
  const { focusContext } = useFolderTreeKeyboardNavigation({
    treeId,
    selectedRowId,
    actions,
    collapsedFolderIds: layout.collapsedFolderIds,
    tree,
    treeRef,
    showRoot: showRootRow,
    rootSectionExpanded,
    rootLabel,
    onRootSectionToggle: toggleRootSection,
  });

  // Keep the open note in view, so opening it from a tab, link or the palette shows where it lives.
  useEffect(() => {
    if (!selection.selectedNoteId) {
      return;
    }

    const row = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[data-folder-tree-row-id]') ?? [])
      .find((candidate) => candidate.dataset.folderTreeRowId === `note:${selection.selectedNoteId}`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [selection.selectedNoteId]);

  useEffect(() => {
    if (treeFocusRequestId === 0) {
      return;
    }

    const row = selectedRowId
      ? treeRef.current?.querySelector<HTMLElement>(`[data-folder-tree-row-id="${selectedRowId}"]`)
      : null;
    const target = row?.querySelector<HTMLElement>('[data-folder-tree-primary="true"]')
      ?? row?.querySelector<HTMLElement>('button:not([disabled])')
      ?? treeRef.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')
      ?? treeRef.current?.querySelector<HTMLElement>('[data-folder-tree-primary="true"]')
      ?? treeRef.current?.querySelector<HTMLElement>('button:not([disabled])');
    target?.focus();
  }, [selectedRowId, treeFocusRequestId]);

  const showFolderDrop = (next: FolderDropIndicator | null) => {
    const current = folderDropRef.current;
    if (current?.row === next?.row && current?.placement === next?.placement) return;
    if (current) delete current.row.dataset.dropPlacement;
    if (next) next.row.dataset.dropPlacement = next.placement;
    folderDropRef.current = next;
  };

  const endPointerFolderDrag = () => {
    stopPointerTrackingRef.current?.();
    stopPointerTrackingRef.current = null;
    pointerYRef.current = null;
    showFolderDrop(null);
  };

  // Marks the folder row a pointer drag would drop on, and on which side.
  const handleDragMove = (event: DragMoveEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const pointerY = pointerYRef.current;
    if (pointerY === null || parseNoteDragId(activeId) || !overId || overId === ROOT_FOLDER_DROP_ID) {
      showFolderDrop(null);
      return;
    }
    const row = treeRef.current?.querySelector<HTMLElement>(`[data-folder-tree-row-id="folder:${CSS.escape(overId)}"]`);
    const node = tree.nodesById.get(overId);
    if (!row || !node) {
      showFolderDrop(null);
      return;
    }
    const bounds = row.getBoundingClientRect();
    const placement = getFolderDropPlacement({
      pointerY,
      top: bounds.top,
      height: bounds.height,
      showsChildrenBelow: (node.children.length > 0 || node.notes.length > 0) && !layout.collapsedFolderIds.has(overId),
    });
    const valid = getPlacedFolderDrop({ items: visibleFolderItems, activeId, overId, placement });
    showFolderDrop(valid ? { overId, placement, row } : null);
  };

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
    const pointerStart = event.activatorEvent instanceof PointerEvent ? event.activatorEvent : null;
    setKeyboardFolderDrag(!pointerStart);
    if (pointerStart) {
      pointerYRef.current = pointerStart.clientY;
      const track = (moveEvent: PointerEvent) => { pointerYRef.current = moveEvent.clientY; };
      document.addEventListener('pointermove', track, { passive: true });
      stopPointerTrackingRef.current = () => document.removeEventListener('pointermove', track);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const pointerFolderDrop = pointerYRef.current === null ? undefined : folderDropRef.current;
    endPointerFolderDrag();
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

    // A pointer drop on a folder row goes where its mark showed: before, after or inside. With
    // no mark (an invalid target) nothing moves. The workspace row and keyboard drags project the
    // drop from the drag itself.
    const placed = pointerFolderDrop !== undefined && overId !== ROOT_FOLDER_DROP_ID;
    if (placed && pointerFolderDrop?.overId !== overId) {
      return;
    }
    const placement = placed ? pointerFolderDrop?.placement : undefined;
    const projection = placement
      ? getPlacedFolderDrop({ items: visibleFolderItems, activeId, overId, placement })
      : getProjectedFolderDrop({
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
      placement,
    });
    if (operation?.changed) {
      actions.onFolderDrop(operation);
    }
  };

  const handleDragCancel = () => {
    endPointerFolderDrag();
    setActiveFolderId(null);
    setActiveNoteId(null);
  };

  // The rows don't depend on whether the root is open: memoized, toggling it only flips the
  // group's hidden attribute instead of re-rendering every row.
  const treeRows = useMemo(() => (
    <>
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
    topLevelGuides={showRootRow}
  />
  {tree.unfiled.notes.map((entry, index) => (
    <li role="presentation" key={`root:${entry.note.id}`} className={treeItemClassName(showRootRow, true)}>
      {showRootRow ? <span aria-hidden="true" data-tree-guide={index === tree.unfiled.notes.length - 1 ? 'end' : 'continuation'} className={TREE_GUIDE_CLASS} /> : null}
      <NoteRow
        entry={entry}
        selected={entry.note.id === selection.selectedNoteId && (!selection.selectedFolderId || selection.selectedFolderId === UNFILED_FOLDER_ID)}
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
    </>
  ), [
    actions, activeFolderId, activeNoteId, layout.collapsedFolderIds, selectedFolderForNoteMove,
    selection.selectedFolderId, selection.selectedNoteId, showRootRow, status.isMovingFolder,
    status.isMovingNote, tree,
  ]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={treeCollisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      // The last move can enter a new row before dnd-kit updates event.over.
      onDragOver={handleDragMove}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortableFolderIds}
        strategy={keyboardFolderDrag ? verticalListSortingStrategy : POINTER_FOLDER_SORTING}
      >
        <div
          ref={treeRef}
          className="grid min-w-0 gap-0.5"
          data-testid="folder-navigator-tree"
          role="tree"
          aria-label="Folders and notes"
        >
          <FolderTreeFocusContext.Provider value={focusContext}>
            {showRootRow ? (
              <WorkspaceRootTreeRow
                scope={scope}
                label={rootLabel}
                selected={rootSelected}
                sectionExpanded={rootSectionExpanded}
                dragActive={Boolean(activeFolderId || activeNoteId)}
                onSelectTopLevel={() => actions.onFolderSelect(UNFILED_FOLDER_ID)}
                onSectionToggle={toggleRootSection}
                onCreateFolder={() => actions.onCreateFolderInside(null)}
                onCreateNote={() => actions.onCreateNoteInside(null)}
                canCreate={status.canCreate && !status.isCreating}
                onCreateFromTemplate={actions.onCreateFromTemplate}
                onImportMarkdown={actions.onImportMarkdown}
                // Sort and filters describe how this workspace's notes are listed, so they live on
                // its row. Changing one lists the notes flat, under a header that carries them on.
                viewOptions={({ tabIndex }) => (
                  <TreeViewOptions tabIndex={tabIndex} />
                )}
              />
            ) : null}
            {/* Under the workspace root, folders and notes sit one level in, like any folder's children.
                Collapsing the root hides them rather than unmounting them: remounting every row on
                expand took ~300ms in a large workspace, while hiding is a single style change. */}
            <ul
                id={workspaceChildrenGroupId}
                role="group"
                hidden={showRootRow && !rootSectionExpanded}
                className={cn('m-0 grid min-w-0 list-none gap-0.5 p-0', showRootRow && cn('relative mt-0.5', TREE_CHILDREN_INDENT_CLASS))}
              >
                {treeRows}
              </ul>
            <TreeBlankArea
              onSelect={() => actions.onFolderSelect(UNFILED_FOLDER_ID)}
              onCreateFolder={() => actions.onCreateFolderInside(null)}
              onCreateNote={() => actions.onCreateNoteInside(null)}
            />
          </FolderTreeFocusContext.Provider>
        </div>
      </SortableContext>
      {/* The preview never takes the pointer: after a drop it animates back over the tree, where
          it would swallow the press that starts the next drag. */}
      <DragOverlay className="pointer-events-none" modifiers={PREVIEW_MODIFIERS}>
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
