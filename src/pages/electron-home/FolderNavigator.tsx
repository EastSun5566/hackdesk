import {
  AlertCircle,
  ArrowDownUp,
  Check,
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
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NotePermissionRole, NoteSummary } from '@/lib/electron-api';
import {
  buildFolderDropOperation,
  flattenFolderTree,
  getProjectedFolderDrop,
  ROOT_FOLDER_DROP_ID,
  type FolderDropOperation,
} from '@/lib/hackmd-folder-dnd';
import {
  buildNoteDragId,
  buildNoteDropOperation,
  getNoteCurrentFolderId,
  parseNoteDragId,
  type NoteDropOperation,
} from '@/lib/hackmd-note-dnd';
import {
  getActiveNoteFinderFilterCount,
  getNoteFinderOptions,
  hasActiveNoteFinderFilters,
  isNoteFinderActive,
  togglePermissionFilter,
  toggleStringFilter,
  type NoteFinderSortMode,
  type NoteFinderState,
} from '@/lib/electron-note-finder';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import { EmptyState, EntityRow, PanelHeader, PanelShell } from './interaction-primitives';
import type { WorkspaceScope } from './types';
import { RepositoryNotice } from './RepositoryNotice';
import {
  COMPACT_ICON_BUTTON_CLASS,
  COLLAPSE_ICON_CLASS,
  FOCUS_RING_CLASS,
  ICON_BUTTON_CLASS,
  formatDate,
  getFolderTotalNoteCount,
} from './ui';
import { NAVIGATOR_COLLAPSED_WIDTH } from './ui-preferences';

const SORT_LABELS: Record<NoteFinderSortMode, string> = {
  'updated-desc': 'Recently updated',
  'updated-asc': 'Oldest updated',
  'title-asc': 'Title A-Z',
  'title-desc': 'Title Z-A',
  'created-desc': 'Created newest',
};

const SORT_MODES: NoteFinderSortMode[] = ['updated-desc', 'updated-asc', 'title-asc', 'title-desc', 'created-desc'];

const PERMISSION_LABELS: Record<NotePermissionRole, string> = {
  owner: 'Owner',
  signed_in: 'Signed in',
  guest: 'Guest',
};

function CheckedIcon({ checked }: { checked: boolean }) {
  return <Check aria-hidden="true" className={`h-3.5 w-3.5 ${checked ? 'opacity-100' : 'opacity-0'}`} />;
}

function FilterChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={`inline-flex h-7 min-w-0 items-center gap-1 rounded-[6px] border border-border-default bg-background-default px-2 text-xs text-text-default transition-colors hover:bg-background-selected ${FOCUS_RING_CLASS}`}
      aria-label={`Remove ${removeLabel}`}
    >
      <span className="truncate">{label}</span>
      <X aria-hidden="true" className="h-3 w-3 text-text-subtle" />
    </button>
  );
}

function NoteFinderToolbar({
  state,
  resultCount,
  selectedFolderId,
  options,
  onChange,
}: {
  state: NoteFinderState;
  resultCount: number;
  selectedFolderId: string | null;
  options: ReturnType<typeof getNoteFinderOptions>;
  onChange: (state: NoteFinderState) => void;
}) {
  const activeFilterCount = getActiveNoteFinderFilterCount(state);
  const currentFolderDisabled = !selectedFolderId;
  const updateState = (patch: Partial<NoteFinderState>) => onChange({ ...state, ...patch });
  const removeTag = (tag: string) => updateState({ tagFilters: state.tagFilters.filter((candidate) => candidate !== tag) });
  const removeReadPermission = (permission: NotePermissionRole) => updateState({
    readPermissionFilters: state.readPermissionFilters.filter((candidate) => candidate !== permission),
  });
  const removeWritePermission = (permission: NotePermissionRole) => updateState({
    writePermissionFilters: state.writePermissionFilters.filter((candidate) => candidate !== permission),
  });

  return (
    <div className="space-y-3">
      <label className="flex h-10 items-center gap-2 rounded-md border border-border-default bg-background-default px-3 transition-colors focus-within:border-primary-default">
        <Search aria-hidden="true" className="h-4 w-4 text-text-subtle" />
        <span className="sr-only">Search notes</span>
        <input
          value={state.query}
          onChange={(event) => updateState({ query: event.target.value })}
          placeholder="Search notes"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {state.query ? (
          <button
            type="button"
            onClick={() => updateState({ query: '' })}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-subtle hover:text-text-default ${FOCUS_RING_CLASS}`}
            aria-label="Clear search"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border-default bg-background-default p-0.5" aria-label="Search scope">
          <button
            type="button"
            onClick={() => updateState({ searchScope: 'workspace' })}
            aria-pressed={state.searchScope === 'workspace'}
            className={`h-7 rounded-[5px] px-2 text-xs transition-colors ${state.searchScope === 'workspace' ? 'bg-background-selected text-text-default' : 'text-text-subtle hover:text-text-default'} ${FOCUS_RING_CLASS}`}
          >
            Workspace
          </button>
          <button
            type="button"
            onClick={() => updateState({ searchScope: 'current-folder' })}
            disabled={currentFolderDisabled}
            aria-pressed={state.searchScope === 'current-folder'}
            className={`h-7 rounded-[5px] px-2 text-xs transition-colors ${state.searchScope === 'current-folder' ? 'bg-background-selected text-text-default' : 'text-text-subtle hover:text-text-default'} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`}
          >
            Current Folder
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={COMPACT_ICON_BUTTON_CLASS} aria-label="Sort notes">
              <ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">{SORT_LABELS[state.sortMode]}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Sort</DropdownMenuLabel>
            {SORT_MODES.map((sortMode) => (
              <DropdownMenuItem key={sortMode} onSelect={() => updateState({ sortMode })}>
                <CheckedIcon checked={state.sortMode === sortMode} />
                {SORT_LABELS[sortMode]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={`${COMPACT_ICON_BUTTON_CLASS} gap-1 px-2`} aria-label="Filter notes">
              <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="text-xs">{activeFilterCount || 'Filters'}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-96 min-w-56 overflow-auto">
            <DropdownMenuLabel>Tags</DropdownMenuLabel>
            {options.tags.length > 0 ? options.tags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={state.tagFilters.includes(tag)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => updateState({ tagFilters: toggleStringFilter(state.tagFilters, tag) })}
              >
                {tag}
              </DropdownMenuCheckboxItem>
            )) : (
              <DropdownMenuItem disabled>No tags loaded</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Read Permission</DropdownMenuLabel>
            {options.readPermissions.map((permission) => (
              <DropdownMenuCheckboxItem
                key={`read:${permission}`}
                checked={state.readPermissionFilters.includes(permission)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => updateState({ readPermissionFilters: togglePermissionFilter(state.readPermissionFilters, permission) })}
              >
                {PERMISSION_LABELS[permission]}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Write Permission</DropdownMenuLabel>
            {options.writePermissions.map((permission) => (
              <DropdownMenuCheckboxItem
                key={`write:${permission}`}
                checked={state.writePermissionFilters.includes(permission)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => updateState({ writePermissionFilters: togglePermissionFilter(state.writePermissionFilters, permission) })}
              >
                {PERMISSION_LABELS[permission]}
              </DropdownMenuCheckboxItem>
            ))}
            {hasActiveNoteFinderFilters(state) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => updateState({
                  tagFilters: [],
                  readPermissionFilters: [],
                  writePermissionFilters: [],
                })}
                >
                  Clear Filters
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-auto text-xs text-text-subtle" aria-live="polite">
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </span>
      </div>

      {hasActiveNoteFinderFilters(state) ? (
        <div className="flex flex-wrap gap-1.5">
          {state.tagFilters.map((tag) => (
            <FilterChip key={`tag:${tag}`} label={tag} removeLabel={`tag filter ${tag}`} onRemove={() => removeTag(tag)} />
          ))}
          {state.readPermissionFilters.map((permission) => (
            <FilterChip key={`read:${permission}`} label={`Read: ${PERMISSION_LABELS[permission]}`} removeLabel={`read permission filter ${PERMISSION_LABELS[permission]}`} onRemove={() => removeReadPermission(permission)} />
          ))}
          {state.writePermissionFilters.map((permission) => (
            <FilterChip key={`write:${permission}`} label={`Write: ${PERMISSION_LABELS[permission]}`} removeLabel={`write permission filter ${PERMISSION_LABELS[permission]}`} onRemove={() => removeWritePermission(permission)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NoteRow({
  entry,
  selected,
  onSelect,
  onOpen,
  onDelete,
  onMoveToSelectedFolder,
  selectedFolder,
  draggable = false,
  disabledDrag = false,
  active = false,
  compact = false,
}: {
  entry: FolderTreeNote;
  selected: boolean;
  onSelect: (note: NoteSummary) => void;
  onOpen: (note: NoteSummary) => void;
  onDelete: (note: NoteSummary) => void;
  onMoveToSelectedFolder?: (entry: FolderTreeNote) => void;
  selectedFolder?: FolderTreeNode | null;
  draggable?: boolean;
  disabledDrag?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  const metadata = [
    entry.folderLabel,
    entry.note.tags.slice(0, 2).join(', '),
  ].filter(Boolean).join(' · ');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: buildNoteDragId(entry.note.id),
    disabled: !draggable || disabledDrag,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
  };
  const canMoveToSelectedFolder = Boolean(
    selectedFolder
    && (selectedFolder.id === UNFILED_FOLDER_ID
      ? getNoteCurrentFolderId(entry) !== null
      : selectedFolder.id !== getNoteCurrentFolderId(entry)),
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          data-note-id={entry.note.id}
          className={isDragging || active ? 'opacity-40' : undefined}
        >
          <EntityRow
            selected={selected}
            icon={<FileText className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
            leadingControls={draggable ? (
              <button
                type="button"
                className={`flex h-6 w-5 shrink-0 items-center justify-center rounded text-text-subtle opacity-0 transition-opacity hover:text-text-default group-hover/entity-row:opacity-100 group-focus-within/entity-row:opacity-100 motion-reduce:transition-none ${FOCUS_RING_CLASS}`}
                aria-label={`Drag ${entry.note.title || 'Untitled'}`}
                disabled={disabledDrag}
                {...attributes}
                {...listeners}
              >
                <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            ) : null}
            title={(
              <button
                type="button"
                onClick={() => onSelect(entry.note)}
                className={`block min-w-0 truncate rounded-[4px] text-left ${FOCUS_RING_CLASS}`}
              >
                {entry.note.title || 'Untitled'}
              </button>
            )}
            subtitle={metadata || entry.note.shortId}
            trailing={formatDate(entry.note.updatedAtMillis)}
            variant={compact ? 'compact' : 'default'}
            active={active}
            className={selected ? 'bg-primary-soft' : undefined}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpen(entry.note)}>
          <FileText aria-hidden="true" className="h-4 w-4" />
          Open in Web Editor
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canMoveToSelectedFolder}
          onSelect={() => {
            if (canMoveToSelectedFolder) {
              onMoveToSelectedFolder?.(entry);
            }
          }}
        >
          <FolderOpen aria-hidden="true" className="h-4 w-4" />
          Move to Selected Folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onSelect={() => onDelete(entry.note)}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FolderButton({
  node,
  selected,
  collapsed,
  active,
  noteDropTarget,
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
  noteDropTarget: boolean;
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
    isOver,
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
          className={isDragging || active ? 'opacity-40' : undefined}
        >
          <EntityRow
            selected={selected}
            active={noteDropTarget && isOver}
            variant="compact"
            leadingControls={(
              <span className="flex items-center gap-0.5">
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
                  className={`flex h-6 w-5 shrink-0 items-center justify-center rounded text-text-subtle opacity-0 transition-opacity hover:text-text-default group-hover/entity-row:opacity-100 group-focus-within/entity-row:opacity-100 motion-reduce:transition-none ${FOCUS_RING_CLASS}`}
                  aria-label={`Drag ${node.name}`}
                  {...attributes}
                  {...listeners}
                >
                  <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            icon={collapsed ? <Folder className="h-3.5 w-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
            title={(
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className={`block min-w-0 truncate rounded-[4px] text-left ${FOCUS_RING_CLASS}`}
              >
                {node.name}
              </button>
            )}
            trailing={totalNotes}
          />
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
  folderDragActive,
  noteDragActive,
  onSelect,
  onCreateFolder,
}: {
  selected: boolean;
  noteCount: number;
  folderDragActive: boolean;
  noteDragActive: boolean;
  onSelect: () => void;
  onCreateFolder: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_FOLDER_DROP_ID });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div ref={setNodeRef}>
          <EntityRow
            selected={selected || ((folderDragActive || noteDragActive) && isOver)}
            icon={<Folder className="h-3.5 w-3.5" />}
            title="Root"
            trailing={noteCount}
            variant="compact"
            onClick={onSelect}
          />
        </div>
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

function NoteDragOverlay({ entry }: { entry: FolderTreeNote | null }) {
  if (!entry) {
    return null;
  }

  return (
    <div className="flex min-h-9 min-w-56 items-center gap-2 rounded-[6px] border border-border-default bg-background-default px-3 py-2 text-sm text-text-default shadow-lg">
      <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-text-subtle" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{entry.note.title || 'Untitled'}</span>
        <span className="block truncate text-xs text-text-subtle">{entry.folderLabel || entry.note.shortId}</span>
      </span>
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
  activeNoteId,
  depth,
  onFolderSelect,
  onFolderToggle,
  onCreateFolderInside,
  onRenameFolder,
  onDeleteFolder,
  onNoteSelect,
  onNoteOpen,
  onNoteDelete,
  onNoteMoveToSelectedFolder,
  selectedFolderForNoteMove,
  isMovingNote,
}: {
  nodes: FolderTreeNode[];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  collapsedFolderIds: Set<string>;
  activeFolderId: string | null;
  activeNoteId: string | null;
  depth: number;
  onFolderSelect: (folderId: string) => void;
  onFolderToggle: (folderId: string) => void;
  onCreateFolderInside: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onNoteSelect: (note: NoteSummary) => void;
  onNoteOpen: (note: NoteSummary) => void;
  onNoteDelete: (note: NoteSummary) => void;
  onNoteMoveToSelectedFolder: (entry: FolderTreeNote) => void;
  selectedFolderForNoteMove: FolderTreeNode | null;
  isMovingNote: boolean;
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
              noteDropTarget={Boolean(activeNoteId)}
              onSelect={onFolderSelect}
              onToggle={onFolderToggle}
              onCreateFolderInside={onCreateFolderInside}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
            />
            <div
              className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none ${
                !collapsed && !isActiveFolder ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="mt-0.5 grid gap-0.5">
                  <FolderTreeView
                    nodes={node.children}
                    selectedFolderId={selectedFolderId}
                    selectedNoteId={selectedNoteId}
                    collapsedFolderIds={collapsedFolderIds}
                    activeFolderId={activeFolderId}
                    activeNoteId={activeNoteId}
                    depth={depth + 1}
                    onFolderSelect={onFolderSelect}
                    onFolderToggle={onFolderToggle}
                    onCreateFolderInside={onCreateFolderInside}
                    onRenameFolder={onRenameFolder}
                    onDeleteFolder={onDeleteFolder}
                    onNoteSelect={onNoteSelect}
                    onNoteOpen={onNoteOpen}
                    onNoteDelete={onNoteDelete}
                    onNoteMoveToSelectedFolder={onNoteMoveToSelectedFolder}
                    selectedFolderForNoteMove={selectedFolderForNoteMove}
                    isMovingNote={isMovingNote}
                  />
                  {node.notes.map((entry) => (
                    <div key={`${node.id}:${entry.note.id}`} className="relative pl-5">
                      <div className="absolute left-[13px] top-1 bottom-1 w-px bg-border-default/70" aria-hidden="true" />
                      <NoteRow
                        entry={entry}
                        selected={entry.note.id === selectedNoteId}
                        onSelect={onNoteSelect}
                        onOpen={onNoteOpen}
                        onDelete={onNoteDelete}
                        onMoveToSelectedFolder={onNoteMoveToSelectedFolder}
                        selectedFolder={selectedFolderForNoteMove}
                        draggable
                        disabledDrag={isMovingNote}
                        active={activeNoteId === entry.note.id}
                        compact
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
  finderState,
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
  isMovingNote,
  onFolderSelect,
  onFolderToggle,
  onNoteSelect,
  onFinderStateChange,
  onRefresh,
  onCreate,
  onCreateFolder,
  onCreateFolderInside,
  onRenameFolder,
  onDeleteFolder,
  onFolderDrop,
  onNoteMove,
  onOpenNote,
  onDeleteNote,
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
  finderState: NoteFinderState;
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
  isMovingNote: boolean;
  onFolderSelect: (folderId: string | null) => void;
  onFolderToggle: (folderId: string) => void;
  onNoteSelect: (note: NoteSummary) => void;
  onFinderStateChange: (state: NoteFinderState) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onCreateFolder: () => void;
  onCreateFolderInside: (folderId: string | null) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onFolderDrop: (operation: FolderDropOperation) => void;
  onNoteMove: (operation: NoteDropOperation) => void;
  onOpenNote: (note: NoteSummary) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onToggleCollapsed: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}) {
  const isFinderMode = isNoteFinderActive(finderState);
  const finderOptions = useMemo(() => getNoteFinderOptions(tree.allNotes), [tree.allNotes]);
  const hasTreeContent = tree.roots.length > 0 || tree.unfiled.notes.length > 0;
  const navigatorSubtitle = isLoading
    ? 'Loading…'
    : isFetching
      ? 'Syncing…'
      : isFinderMode
        ? 'Finder'
        : `${entries.length} notes`;
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const selectedConcreteFolder = selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID
    ? tree.nodesById.get(selectedFolderId) ?? null
    : null;
  const selectedFolderForNoteMove = selectedFolderId === UNFILED_FOLDER_ID
    ? tree.unfiled
    : selectedConcreteFolder;
  const visibleFolderItems = useMemo(
    () => flattenFolderTree(tree, collapsedFolderIds),
    [collapsedFolderIds, tree],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      if (!isMovingNote) {
        onNoteMove(noteOperation);
      }
      return;
    }

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
  const handleDragCancel = () => {
    setActiveFolderId(null);
    setActiveNoteId(null);
  };
  const handleNoteMoveToSelectedFolder = (entry: FolderTreeNote) => {
    if (!selectedFolderForNoteMove) {
      return;
    }

    const targetFolderId = selectedFolderForNoteMove.id === UNFILED_FOLDER_ID ? null : selectedFolderForNoteMove.id;
    onNoteMove({
      note: entry,
      targetFolderId,
      changed: getNoteCurrentFolderId(entry) !== targetFolderId,
    });
  };
  const activeNote = activeNoteId
    ? tree.allNotes.find((entry) => entry.note.id === activeNoteId) ?? null
    : null;

  return (
    <PanelShell
      id={id}
      focusZone="navigator"
      collapsed={collapsed}
      width={width}
      collapsedWidth={NAVIGATOR_COLLAPSED_WIDTH}
      className="border-r border-border-default bg-background-muted"
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
          <PanelHeader
            title={scope.label}
            subtitle={navigatorSubtitle}
            className="space-y-3"
            actions={(
              <>
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
                  selectedFolder={selectedConcreteFolder}
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
              </>
            )}
          />
          <div className="space-y-3 border-b border-border-default px-4 pb-4">
            <NoteFinderToolbar
              state={finderState}
              resultCount={entries.length}
              selectedFolderId={selectedFolderId}
              options={finderOptions}
              onChange={onFinderStateChange}
            />

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
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-text-subtle">
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                <span>Loading notes…</span>
              </div>
            ) : entries.length === 0 && (!hasTreeContent || isFinderMode) ? (
              <EmptyState
                icon={<FileText aria-hidden="true" className="h-7 w-7" />}
                title={emptyTitle}
                description={emptyDescription}
              />
            ) : isFinderMode ? (
              <div className="space-y-1">
                {entries.map((entry) => (
                  <NoteRow
                    key={`${entry.folderLabel}:${entry.note.id}`}
                    entry={entry}
                    selected={entry.note.id === selectedNoteId}
                    onSelect={onNoteSelect}
                    onOpen={onOpenNote}
                    onDelete={onDeleteNote}
                    onMoveToSelectedFolder={handleNoteMoveToSelectedFolder}
                    selectedFolder={selectedFolderForNoteMove}
                  />
                ))}
              </div>
            ) : (
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
                  <div className="grid gap-0.5">
                    <RootFolderRow
                      selected={selectedFolderId === UNFILED_FOLDER_ID}
                      noteCount={tree.unfiled.notes.length}
                      folderDragActive={Boolean(activeFolderId)}
                      noteDragActive={Boolean(activeNoteId)}
                      onSelect={() => onFolderSelect(UNFILED_FOLDER_ID)}
                      onCreateFolder={() => onCreateFolderInside(null)}
                    />
                    <FolderTreeView
                      nodes={tree.roots}
                      selectedFolderId={selectedFolderId}
                      selectedNoteId={selectedNoteId}
                      collapsedFolderIds={collapsedFolderIds}
                      activeFolderId={activeFolderId}
                      activeNoteId={activeNoteId}
                      depth={0}
                      onFolderSelect={onFolderSelect}
                      onFolderToggle={onFolderToggle}
                      onCreateFolderInside={onCreateFolderInside}
                      onRenameFolder={onRenameFolder}
                      onDeleteFolder={onDeleteFolder}
                      onNoteSelect={onNoteSelect}
                      onNoteOpen={onOpenNote}
                      onNoteDelete={onDeleteNote}
                      onNoteMoveToSelectedFolder={handleNoteMoveToSelectedFolder}
                      selectedFolderForNoteMove={selectedFolderForNoteMove}
                      isMovingNote={isMovingNote}
                    />
                    {tree.unfiled.notes.map((entry) => (
                      <NoteRow
                        key={`root:${entry.note.id}`}
                        entry={entry}
                        selected={entry.note.id === selectedNoteId}
                        onSelect={onNoteSelect}
                        onOpen={onOpenNote}
                        onDelete={onDeleteNote}
                        onMoveToSelectedFolder={handleNoteMoveToSelectedFolder}
                        selectedFolder={selectedFolderForNoteMove}
                        draggable
                        disabledDrag={isMovingNote}
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
            )}
          </div>
        </>
      )}
    </PanelShell>
  );
}
