import {
  AlertCircle,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPen,
  FolderPlus,
  GripVertical,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NoteSummary } from '@/lib/electron-api';
import {
  buildFolderDropOperation,
  flattenFolderTree,
  getProjectedFolderDrop,
  ROOT_FOLDER_DROP_ID,
  type FolderDropOperation,
} from '@/lib/hackmd-folder-dnd';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import type { WorkspaceScope } from './types';
import { RepositoryNotice } from './RepositoryNotice';
import {
  COLLAPSE_ICON_CLASS,
  FOCUS_RING_CLASS,
  ICON_BUTTON_CLASS,
  PANEL_TRANSITION_CLASS,
  formatDate,
  getFolderTotalNoteCount,
} from './ui';
import { NAVIGATOR_COLLAPSED_WIDTH } from './ui-preferences';

function NoteRow({
  entry,
  selected,
  onSelect,
  compact = false,
}: {
  entry: FolderTreeNote;
  selected: boolean;
  onSelect: (note: NoteSummary) => void;
  compact?: boolean;
}) {
  const metadata = [
    entry.folderLabel,
    entry.note.tags.slice(0, 2).join(', '),
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.note)}
      className={`flex w-full min-w-0 items-start text-left transition-colors ${
        selected ? 'bg-primary-soft text-text-default' : 'hover:bg-background-selected'
      } ${FOCUS_RING_CLASS} ${compact ? 'gap-2 rounded-[6px] px-2 py-1.5' : 'gap-3 rounded-md px-3 py-2.5'}`}
    >
      <FileText aria-hidden="true" className={`${compact ? 'mt-0.5 h-3.5 w-3.5' : 'mt-0.5 h-4 w-4'} shrink-0 text-text-subtle`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{entry.note.title || 'Untitled'}</span>
        <span className="mt-1 block truncate text-xs text-text-subtle">{metadata || entry.note.shortId}</span>
      </span>
      <span className="shrink-0 text-xs text-text-subtle">{formatDate(entry.note.updatedAtMillis)}</span>
    </button>
  );
}

function FolderButton({
  node,
  selected,
  collapsed,
  active,
  onSelect,
  onToggle,
  onCreateFolderInside,
  onRenameFolder,
  onDeleteFolder,
}: {
  node: FolderTreeNode;
  selected: boolean;
  collapsed: boolean;
  active: boolean;
  onSelect: (folderId: string) => void;
  onToggle: (folderId: string) => void;
  onCreateFolderInside: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
}) {
  const hasChildren = node.children.length > 0 || node.notes.length > 0;
  const totalNotes = getFolderTotalNoteCount(node);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          data-folder-id={node.id}
          className={`group flex h-8 w-full min-w-0 items-center gap-1 rounded-[6px] px-1 text-sm transition-colors ${
            selected ? 'bg-background-selected text-text-default' : 'text-text-subtle hover:bg-background-selected hover:text-text-default'
          } ${isDragging || active ? 'opacity-40' : ''}`}
        >
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            disabled={!hasChildren}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-subtle hover:text-text-default ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-0`}
            aria-hidden={!hasChildren}
            aria-label={hasChildren ? (collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`) : undefined}
            aria-expanded={hasChildren ? !collapsed : undefined}
          >
            <ChevronRight
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${COLLAPSE_ICON_CLASS} ${collapsed ? '' : 'rotate-90'}`}
            />
          </button>
          <button
            type="button"
            className={`flex h-6 w-5 shrink-0 items-center justify-center rounded text-text-subtle opacity-0 transition-opacity hover:text-text-default group-hover:opacity-100 group-focus-within:opacity-100 ${FOCUS_RING_CLASS}`}
            aria-label={`Drag ${node.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-[4px] text-left ${FOCUS_RING_CLASS}`}
          >
            {collapsed ? <Folder aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </button>
          <span className="shrink-0 px-1 text-xs text-text-subtle">{totalNotes}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onCreateFolderInside(node.id)}>
          <FolderPlus aria-hidden="true" className="h-4 w-4" />
          New Folder Inside
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onRenameFolder(node.id)}>
          <FolderPen aria-hidden="true" className="h-4 w-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem destructive onSelect={() => onDeleteFolder(node.id)}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RootFolderRow({
  selected,
  noteCount,
  onSelect,
  onCreateFolder,
}: {
  selected: boolean;
  noteCount: number;
  onSelect: () => void;
  onCreateFolder: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_FOLDER_DROP_ID });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          onClick={onSelect}
          className={`flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-sm transition-colors ${FOCUS_RING_CLASS} ${
            selected || isOver
              ? 'bg-background-selected text-text-default'
              : 'text-text-subtle hover:bg-background-selected hover:text-text-default'
          }`}
        >
          <Folder aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="min-w-0 flex-1 truncate">Root</span>
          <span className="shrink-0 text-xs text-text-subtle">{noteCount}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onCreateFolder}>
          <FolderPlus aria-hidden="true" className="h-4 w-4" />
          New Folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FolderDragOverlay({ node }: { node: FolderTreeNode | null }) {
  if (!node) {
    return null;
  }

  return (
    <div className="flex h-8 min-w-48 items-center gap-2 rounded-[6px] border border-border-default bg-background-default px-2 text-sm text-text-default shadow-lg">
      <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{node.name}</span>
    </div>
  );
}

function FolderActionsDropdown({
  selectedFolder,
  canCreate,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenPalette,
}: {
  selectedFolder: FolderTreeNode | null;
  canCreate: boolean;
  onCreateFolder: () => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onOpenPalette: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={ICON_BUTTON_CLASS}
          aria-label="Folder actions"
        >
          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem disabled={!canCreate} onSelect={onCreateFolder}>
          <FolderPlus aria-hidden="true" className="h-4 w-4" />
          New Folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!selectedFolder} onSelect={() => selectedFolder && onRenameFolder(selectedFolder.id)}>
          <FolderPen aria-hidden="true" className="h-4 w-4" />
          Rename Selected Folder
        </DropdownMenuItem>
        <DropdownMenuItem destructive disabled={!selectedFolder} onSelect={() => selectedFolder && onDeleteFolder(selectedFolder.id)}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Delete Selected Folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenPalette}>
          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
          Open Command Palette
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderTreeView({
  nodes,
  selectedFolderId,
  selectedNoteId,
  collapsedFolderIds,
  activeFolderId,
  depth,
  onFolderSelect,
  onFolderToggle,
  onCreateFolderInside,
  onRenameFolder,
  onDeleteFolder,
  onNoteSelect,
}: {
  nodes: FolderTreeNode[];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  collapsedFolderIds: Set<string>;
  activeFolderId: string | null;
  depth: number;
  onFolderSelect: (folderId: string) => void;
  onFolderToggle: (folderId: string) => void;
  onCreateFolderInside: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onNoteSelect: (note: NoteSummary) => void;
}) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className={`grid gap-0.5 ${depth > 0 ? 'relative pl-5' : ''}`}>
      {depth > 0 ? <div className="absolute left-[13px] top-1 bottom-1 w-px bg-border-default/70" aria-hidden="true" /> : null}
      {nodes.map((node) => {
        const collapsed = collapsedFolderIds.has(node.id);
        const isActiveFolder = activeFolderId === node.id;

        return (
          <div key={node.id} className="min-w-0">
            <FolderButton
              node={node}
              selected={selectedFolderId === node.id}
              collapsed={collapsed}
              active={isActiveFolder}
              onSelect={onFolderSelect}
              onToggle={onFolderToggle}
              onCreateFolderInside={onCreateFolderInside}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
            />
            {!collapsed && !isActiveFolder ? (
              <div className="mt-0.5 grid gap-0.5">
                <FolderTreeView
                  nodes={node.children}
                  selectedFolderId={selectedFolderId}
                  selectedNoteId={selectedNoteId}
                  collapsedFolderIds={collapsedFolderIds}
                  activeFolderId={activeFolderId}
                  depth={depth + 1}
                  onFolderSelect={onFolderSelect}
                  onFolderToggle={onFolderToggle}
                  onCreateFolderInside={onCreateFolderInside}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onNoteSelect={onNoteSelect}
                />
                {node.notes.map((entry) => (
                  <div key={`${node.id}:${entry.note.id}`} className="relative pl-5">
                    <div className="absolute left-[13px] top-1 bottom-1 w-px bg-border-default/70" aria-hidden="true" />
                    <NoteRow
                      entry={entry}
                      selected={entry.note.id === selectedNoteId}
                      onSelect={onNoteSelect}
                      compact
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function FolderNavigator({
  id,
  scope,
  tree,
  entries,
  selectedFolderId,
  selectedNoteId,
  search,
  isLoading,
  hasToken,
  collapsed,
  width,
  collapsedFolderIds,
  emptyTitle,
  emptyDescription,
  activeError,
  showingCachedFallback,
  canCreate,
  isFetching,
  isCreating,
  isMovingFolder,
  onFolderSelect,
  onFolderToggle,
  onNoteSelect,
  onSearchChange,
  onRefresh,
  onCreate,
  onCreateFolder,
  onCreateFolderInside,
  onRenameFolder,
  onDeleteFolder,
  onFolderDrop,
  onToggleCollapsed,
  onOpenPalette,
  onOpenSettings,
}: {
  id: string;
  scope: WorkspaceScope;
  tree: FolderTree;
  entries: FolderTreeNote[];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  search: string;
  isLoading: boolean;
  hasToken: boolean;
  collapsed: boolean;
  width: number;
  collapsedFolderIds: Set<string>;
  emptyTitle: string;
  emptyDescription: string;
  activeError: string | null;
  showingCachedFallback: boolean;
  canCreate: boolean;
  isFetching: boolean;
  isCreating: boolean;
  isMovingFolder: boolean;
  onFolderSelect: (folderId: string | null) => void;
  onFolderToggle: (folderId: string) => void;
  onNoteSelect: (note: NoteSummary) => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onCreateFolder: () => void;
  onCreateFolderInside: (folderId: string | null) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onFolderDrop: (operation: FolderDropOperation) => void;
  onToggleCollapsed: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}) {
  const isSearching = search.trim().length > 0;
  const hasTreeContent = tree.roots.length > 0 || tree.unfiled.notes.length > 0;
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const selectedFolder = selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID
    ? tree.nodesById.get(selectedFolderId) ?? null
    : null;
  const visibleFolderItems = useMemo(
    () => flattenFolderTree(tree, collapsedFolderIds),
    [collapsedFolderIds, tree],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveFolderId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveFolderId(null);

    if (!overId || activeId === overId || isMovingFolder) {
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
      onFolderDrop(operation);
    }
  };

  return (
    <section
      id={id}
      data-hackdesk-focus="navigator"
      tabIndex={-1}
      className={`flex shrink-0 flex-col overflow-hidden border-r border-border-default bg-background-muted outline-none ${PANEL_TRANSITION_CLASS}`}
      style={{ width: collapsed ? NAVIGATOR_COLLAPSED_WIDTH : width }}
    >
      {collapsed ? (
        <div className="flex flex-1 justify-center pt-4">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={ICON_BUTTON_CLASS}
            aria-controls={id}
            aria-expanded={false}
            aria-label="Expand note navigator"
            title="Expand note navigator"
          >
            <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <header className="space-y-3 border-b border-border-default px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{scope.label}</h2>
                <p className="text-xs text-text-subtle">{entries.length} notes</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onRefresh}
                  className={ICON_BUTTON_CLASS}
                  aria-label="Refresh notes"
                >
                  <RefreshCcw aria-hidden="true" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={onCreate}
                  disabled={!canCreate || isCreating}
                  className={ICON_BUTTON_CLASS}
                  aria-label="Create note"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onCreateFolder}
                  disabled={!canCreate || isCreating}
                  className={ICON_BUTTON_CLASS}
                  aria-label="Create folder"
                >
                  <FolderPlus aria-hidden="true" className="h-4 w-4" />
                </button>
                <FolderActionsDropdown
                  selectedFolder={selectedFolder}
                  canCreate={canCreate && !isCreating}
                  onCreateFolder={onCreateFolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onOpenPalette={onOpenPalette}
                />
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  className={ICON_BUTTON_CLASS}
                  aria-controls={id}
                  aria-expanded={true}
                  aria-label="Collapse note navigator"
                  title="Collapse note navigator"
                >
                  <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>

            <label className="flex h-10 items-center gap-2 rounded-md border border-border-default bg-background-default px-3 transition-colors focus-within:border-primary-default">
              <Search aria-hidden="true" className="h-4 w-4 text-text-subtle" />
              <span className="sr-only">Search notes</span>
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search notes"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>

            {!hasToken ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className={`flex w-full items-center gap-2 rounded-md border border-border-default bg-background-default px-3 py-2 text-left text-sm text-text-subtle transition-colors hover:bg-background-selected hover:text-text-default ${FOCUS_RING_CLASS}`}
              >
                <AlertCircle aria-hidden="true" className="h-4 w-4" />
                <span>Configure HackMD API Token</span>
              </button>
            ) : null}

            <RepositoryNotice error={activeError} cached={showingCachedFallback} />
          </header>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-text-subtle">
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                <span>Loading notes…</span>
              </div>
            ) : entries.length === 0 && (!hasTreeContent || isSearching) ? (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="max-w-64 space-y-2">
                  <FileText aria-hidden="true" className="mx-auto h-7 w-7 text-text-subtle" />
                  <p className="text-sm font-medium text-text-default">{emptyTitle}</p>
                  <p className="text-xs leading-5 text-text-subtle">{emptyDescription}</p>
                </div>
              </div>
            ) : isSearching ? (
              <div className="space-y-1">
                {entries.map((entry) => (
                  <NoteRow
                    key={`${entry.folderLabel}:${entry.note.id}`}
                    entry={entry}
                    selected={entry.note.id === selectedNoteId}
                    onSelect={onNoteSelect}
                  />
                ))}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragCancel={() => setActiveFolderId(null)}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={visibleFolderItems.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid gap-0.5">
                    <RootFolderRow
                      selected={selectedFolderId === UNFILED_FOLDER_ID}
                      noteCount={tree.unfiled.notes.length}
                      onSelect={() => onFolderSelect(UNFILED_FOLDER_ID)}
                      onCreateFolder={() => onCreateFolderInside(null)}
                    />
                    <FolderTreeView
                      nodes={tree.roots}
                      selectedFolderId={selectedFolderId}
                      selectedNoteId={selectedNoteId}
                      collapsedFolderIds={collapsedFolderIds}
                      activeFolderId={activeFolderId}
                      depth={0}
                      onFolderSelect={onFolderSelect}
                      onFolderToggle={onFolderToggle}
                      onCreateFolderInside={onCreateFolderInside}
                      onRenameFolder={onRenameFolder}
                      onDeleteFolder={onDeleteFolder}
                      onNoteSelect={onNoteSelect}
                    />
                    {tree.unfiled.notes.map((entry) => (
                      <NoteRow
                        key={`root:${entry.note.id}`}
                        entry={entry}
                        selected={entry.note.id === selectedNoteId}
                        onSelect={onNoteSelect}
                        compact
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  <FolderDragOverlay node={activeFolderId ? tree.nodesById.get(activeFolderId) ?? null : null} />
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </>
      )}
    </section>
  );
}
