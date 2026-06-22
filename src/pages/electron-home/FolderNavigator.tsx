import {
  AlertCircle,
  ArrowDownUp,
  Check,
  ChevronRight,
  Copy,
  CopyPlus,
  Download,
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
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { clsx } from 'clsx';

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
import { buildNoteTagIndex, type ElectronNoteTag } from '@/lib/electron-note-tags';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import { CollapsibleSection, EmptyState, EntityRow, PanelHeader, PanelShell, ToolbarDropdownIconTrigger, ToolbarDropdownMoreTrigger, ToolbarIconButton } from './interaction-primitives';
import type { WorkspaceScope } from './types';
import { RepositoryNotice } from './RepositoryNotice';
import {
  COLLAPSE_ICON_CLASS,
  FOCUS_RING_CLASS,
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
const TAG_BROWSER_LIMIT = 6;

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
      className={`inline-flex h-7 min-w-0 items-center gap-1 rounded-[6px] border border-border-default bg-background-default px-2 text-xs text-text-default transition-colors hover:bg-element-bg-hover ${FOCUS_RING_CLASS}`}
      aria-label={`Remove ${removeLabel}`}
    >
      <span className="truncate">{label}</span>
      <X aria-hidden="true" className="h-3 w-3 text-text-subtle" />
    </button>
  );
}

function NoteFinderToolbar({
  state,
  selectedFolderId,
  options,
  onChange,
}: {
  state: NoteFinderState;
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
  const scopeLabel = state.searchScope === 'workspace' ? 'Workspace' : 'Current Folder';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border-default bg-background-default px-2 transition-[border-color,box-shadow] focus-within:border-primary-default focus-within:ring-2 focus-within:ring-primary-default/60">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-text-subtle" />
          <span className="sr-only">Search notes</span>
          <input
            name="noteSearch"
            value={state.query}
            onChange={(event) => updateState({ query: event.target.value })}
            placeholder="Search notes"
            enterKeyHint="search"
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

        <DropdownMenu>
          <ToolbarDropdownIconTrigger label="Search scope" tooltip={`Scope: ${scopeLabel}`} className="h-8 w-8">
            {state.searchScope === 'current-folder'
              ? <FolderOpen aria-hidden="true" className="h-4 w-4" />
              : <FileText aria-hidden="true" className="h-4 w-4" />}
          </ToolbarDropdownIconTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Search Scope</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => updateState({ searchScope: 'workspace' })}>
              <CheckedIcon checked={state.searchScope === 'workspace'} />
              Workspace
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={currentFolderDisabled}
              onSelect={() => updateState({ searchScope: 'current-folder' })}
            >
              <CheckedIcon checked={state.searchScope === 'current-folder'} />
              Current Folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <ToolbarDropdownIconTrigger label="Sort notes" tooltip={SORT_LABELS[state.sortMode]} className="h-8 w-8">
            <ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5" />
          </ToolbarDropdownIconTrigger>
          <DropdownMenuContent align="end">
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
          <ToolbarDropdownIconTrigger
            label="Filter notes"
            tooltip={activeFilterCount ? `${activeFilterCount} active filters` : 'Filter notes'}
            className={`relative h-8 w-8 ${activeFilterCount ? 'bg-background-selected text-text-default' : ''}`}
          >
            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
            {activeFilterCount ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-default px-1 text-[10px] leading-none text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </ToolbarDropdownIconTrigger>
          <DropdownMenuContent align="end" className="max-h-96 min-w-56 overflow-auto">
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

function TagBrowser({
  tags,
  activeTags,
  isLoading,
  onTagToggle,
}: {
  tags: ElectronNoteTag[];
  activeTags: string[];
  isLoading: boolean;
  onTagToggle: (tag: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleTags = showAll ? tags : tags.slice(0, TAG_BROWSER_LIMIT);

  if (isLoading) {
    return null;
  }

  if (tags.length === 0 && activeTags.length === 0) {
    return null;
  }

  return (
    <CollapsibleSection
      key={activeTags.length > 0 ? 'tags-active' : 'tags-idle'}
      title="Tags"
      subtitle={tags.length > 0 ? String(tags.length) : undefined}
      defaultOpen={activeTags.length > 0}
      className="border-b-0 py-0.5"
      contentClassName="space-y-0.5 pt-0.5"
    >
      {tags.length === 0 ? (
        <div className="rounded-md border border-border-default bg-background-default px-2 py-1.5 text-xs text-text-subtle">
          No tags yet
        </div>
      ) : (
        <div className="space-y-1">
          {visibleTags.map((entry) => {
            const active = activeTags.includes(entry.tag);
            return (
              <EntityRow
                key={entry.tag}
                selected={active}
                active={active}
                variant="compact"
                icon={<Tag className="h-3.5 w-3.5" />}
                title={entry.tag}
                trailing={entry.count}
                className="h-7 py-0 text-xs"
                ariaLabel={`${active ? 'Clear' : 'Filter by'} tag ${entry.tag}`}
                onClick={() => onTagToggle(entry.tag)}
              />
            );
          })}
          {tags.length > TAG_BROWSER_LIMIT ? (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className={`mt-0.5 h-7 rounded-[6px] px-2 text-xs text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default ${FOCUS_RING_CLASS}`}
            >
              {showAll ? 'Show less' : `Show ${tags.length - TAG_BROWSER_LIMIT} more`}
            </button>
          ) : null}
        </div>
      )}
    </CollapsibleSection>
  );
}

function NoteRow({
  entry,
  selected,
  onSelect,
  onOpen,
  onCopyLink,
  onCopyMarkdownLink,
  onDuplicate,
  onExportMarkdown,
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
  onCopyLink: (note: NoteSummary) => void;
  onCopyMarkdownLink: (note: NoteSummary) => void;
  onDuplicate: (note: NoteSummary) => void;
  onExportMarkdown: (note: NoteSummary) => void;
  onDelete: (note: NoteSummary) => void;
  onMoveToSelectedFolder?: (entry: FolderTreeNote) => void;
  selectedFolder?: FolderTreeNode | null;
  draggable?: boolean;
  disabledDrag?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const row = rowRef.current;

    if (!row) {
      return undefined;
    }

    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button')) {
        return;
      }
      onSelect(entry.note);
    };

    row.addEventListener('click', handleClick);

    return () => {
      row.removeEventListener('click', handleClick);
    };
  }, [entry.note, onSelect]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={(node) => {
            setNodeRef(node);
            rowRef.current = node;
          }}
          style={style}
          data-note-id={entry.note.id}
          className={clsx('min-w-0', (isDragging || active) && 'opacity-40')}
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
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(entry.note);
                }}
                {...attributes}
                {...listeners}
              >
                <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            ) : null}
            title={(
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(entry.note);
                }}
                className={`block min-w-0 truncate rounded-[4px] text-left ${FOCUS_RING_CLASS}`}
              >
                {entry.note.title || 'Untitled'}
              </button>
            )}
            subtitle={metadata || entry.note.shortId}
            trailing={formatDate(entry.note.updatedAtMillis)}
            trailingClassName="w-[7.25rem] truncate text-right"
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
        <ContextMenuItem onSelect={() => onCopyLink(entry.note)}>
          <Copy aria-hidden="true" className="h-4 w-4" />
          Copy HackMD Link
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopyMarkdownLink(entry.note)}>
          <Copy aria-hidden="true" className="h-4 w-4" />
          Copy Markdown Link
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onDuplicate(entry.note)}>
          <CopyPlus aria-hidden="true" className="h-4 w-4" />
          Duplicate Note
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onExportMarkdown(entry.note)}>
          <Download aria-hidden="true" className="h-4 w-4" />
          Export Markdown
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

const folderColorPattern = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const folderIconPattern = /^[0-9A-Fa-f]{4,6}(?:-[0-9A-Fa-f]{4,6})*$/;

function normalizeFolderColor(color: string | null) {
  return color && folderColorPattern.test(color) ? color : null;
}

function decodeFolderIcon(icon: string | null) {
  if (!icon || !folderIconPattern.test(icon)) {
    return null;
  }

  try {
    return String.fromCodePoint(...icon.split('-').map((segment) => Number.parseInt(segment, 16)));
  } catch {
    return null;
  }
}

function FolderGlyph({
  icon,
  color,
  open,
}: {
  icon: string | null;
  color: string | null;
  open?: boolean;
}) {
  const folderColor = normalizeFolderColor(color);
  const folderIcon = decodeFolderIcon(icon);

  if (folderIcon) {
    return (
      <span
        className="relative flex h-4 w-4 shrink-0 items-center justify-center text-[13px] leading-none"
        data-folder-glyph={icon ?? undefined}
        data-folder-color={folderColor ?? undefined}
      >
        {folderIcon}
        {folderColor ? (
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: folderColor }}
          />
        ) : null}
      </span>
    );
  }

  const Icon = open ? FolderOpen : Folder;

  return (
    <Icon
      className="h-3.5 w-3.5"
      data-folder-glyph="default"
      data-folder-color={folderColor ?? undefined}
      style={folderColor ? { color: folderColor } : undefined}
    />
  );
}

function runAfterMenuClose(action: () => void) {
  window.setTimeout(action, 0);
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
          className={clsx('min-w-0', (isDragging || active) && 'opacity-40')}
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
            icon={<FolderGlyph icon={node.icon} color={node.color} open={!collapsed} />}
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
        <ContextMenuItem onSelect={() => runAfterMenuClose(() => onRenameFolder(node.id))}>
          <FolderPen aria-hidden="true" className="h-4 w-4" />
          Edit Folder
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
        <div ref={setNodeRef} className="min-w-0">
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
    <div className="flex h-8 min-w-48 items-center gap-2 rounded-[6px] border border-border-default bg-background-default px-2 text-sm text-text-default shadow-[0_3px_15px_rgb(0_0_0/0.15)]">
      <FolderGlyph icon={node.icon} color={node.color} open />
      <span className="truncate">{node.name}</span>
    </div>
  );
}

function NoteDragOverlay({ entry }: { entry: FolderTreeNote | null }) {
  if (!entry) {
    return null;
  }

  return (
    <div className="flex min-h-9 min-w-56 items-center gap-2 rounded-[6px] border border-border-default bg-background-default px-3 py-2 text-sm text-text-default shadow-[0_3px_15px_rgb(0_0_0/0.15)]">
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
  onImportMarkdown,
  onRenameFolder,
  onDeleteFolder,
  onOpenPalette,
}: {
  selectedFolder: FolderTreeNode | null;
  canCreate: boolean;
  onCreateFolder: () => void;
  onImportMarkdown: () => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onOpenPalette: () => void;
}) {
  const [open, setOpen] = useState(false);
  const runAfterClose = (action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 0);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <ToolbarDropdownMoreTrigger label="Navigator actions" />
      <DropdownMenuContent>
        <DropdownMenuItem disabled={!canCreate} onSelect={(event) => {
          event.preventDefault();
          runAfterClose(onCreateFolder);
        }}>
          <FolderPlus aria-hidden="true" className="h-4 w-4" />
          New Folder
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canCreate} onSelect={(event) => {
          event.preventDefault();
          runAfterClose(onImportMarkdown);
        }}>
          <Upload aria-hidden="true" className="h-4 w-4" />
          Import Markdown Note
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!selectedFolder} onSelect={(event) => {
          event.preventDefault();
          if (selectedFolder) {
            runAfterClose(() => onRenameFolder(selectedFolder.id));
          }
        }}>
          <FolderPen aria-hidden="true" className="h-4 w-4" />
          Edit Selected Folder
        </DropdownMenuItem>
        <DropdownMenuItem destructive disabled={!selectedFolder} onSelect={(event) => {
          event.preventDefault();
          if (selectedFolder) {
            runAfterClose(() => onDeleteFolder(selectedFolder.id));
          }
        }}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Delete Selected Folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(event) => {
          event.preventDefault();
          runAfterClose(onOpenPalette);
        }}>
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
  onNoteCopyLink,
  onNoteCopyMarkdownLink,
  onNoteDuplicate,
  onNoteExportMarkdown,
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
  onNoteCopyLink: (note: NoteSummary) => void;
  onNoteCopyMarkdownLink: (note: NoteSummary) => void;
  onNoteDuplicate: (note: NoteSummary) => void;
  onNoteExportMarkdown: (note: NoteSummary) => void;
  onNoteDelete: (note: NoteSummary) => void;
  onNoteMoveToSelectedFolder: (entry: FolderTreeNote) => void;
  selectedFolderForNoteMove: FolderTreeNode | null;
  isMovingNote: boolean;
}) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className={`grid min-w-0 gap-0.5 ${depth > 0 ? 'relative pl-5' : ''}`}>
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
                <div className="mt-0.5 grid min-w-0 gap-0.5">
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
                    onNoteCopyLink={onNoteCopyLink}
                    onNoteCopyMarkdownLink={onNoteCopyMarkdownLink}
                    onNoteDuplicate={onNoteDuplicate}
                    onNoteExportMarkdown={onNoteExportMarkdown}
                    onNoteDelete={onNoteDelete}
                    onNoteMoveToSelectedFolder={onNoteMoveToSelectedFolder}
                    selectedFolderForNoteMove={selectedFolderForNoteMove}
                    isMovingNote={isMovingNote}
                  />
                  {node.notes.map((entry) => (
                    <div key={`${node.id}:${entry.note.id}`} className="relative min-w-0 pl-5">
                      <div className="absolute left-[13px] top-1 bottom-1 w-px bg-border-default/70" aria-hidden="true" />
                      <NoteRow
                        entry={entry}
                        selected={entry.note.id === selectedNoteId}
                        onSelect={onNoteSelect}
                        onOpen={onNoteOpen}
                        onCopyLink={onNoteCopyLink}
                        onCopyMarkdownLink={onNoteCopyMarkdownLink}
                        onDuplicate={onNoteDuplicate}
                        onExportMarkdown={onNoteExportMarkdown}
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
  onCopyNoteLink,
  onCopyNoteMarkdownLink,
  onDuplicateNote,
  onExportNoteMarkdown,
  onDeleteNote,
  onImportMarkdown,
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
  onCopyNoteLink: (note: NoteSummary) => void;
  onCopyNoteMarkdownLink: (note: NoteSummary) => void;
  onDuplicateNote: (note: NoteSummary) => void;
  onExportNoteMarkdown: (note: NoteSummary) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onImportMarkdown: () => void;
  onToggleCollapsed: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}) {
  const isFinderMode = isNoteFinderActive(finderState);
  const finderOptions = useMemo(() => getNoteFinderOptions(tree.allNotes), [tree.allNotes]);
  const tagIndex = useMemo(() => buildNoteTagIndex(tree.allNotes), [tree.allNotes]);
  const hasTreeContent = tree.roots.length > 0 || tree.unfiled.notes.length > 0;
  const navigatorSubtitle = isLoading
    ? 'Loading…'
    : isFetching
      ? 'Syncing…'
      : isFinderMode
        ? `${entries.length} ${entries.length === 1 ? 'result' : 'results'}`
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
  const handleTagToggle = (tag: string) => {
    onFinderStateChange({
      ...finderState,
      searchScope: 'workspace',
      tagFilters: finderState.tagFilters.includes(tag)
        ? finderState.tagFilters.filter((candidate) => candidate !== tag)
        : [tag],
    });
  };

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
          <ToolbarIconButton
            onClick={onToggleCollapsed}
            aria-controls={id}
            aria-expanded={false}
            label="Expand note navigator"
          >
            <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
          </ToolbarIconButton>
        </div>
      ) : (
        <>
          <PanelHeader
            title={scope.label}
            subtitle={navigatorSubtitle}
            className="px-3 py-2.5"
            actions={(
              <>
                <ToolbarIconButton
                  onClick={onRefresh}
                  label="Refresh notes"
                >
                  <RefreshCcw aria-hidden="true" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                </ToolbarIconButton>
                <ToolbarIconButton
                  onClick={onCreate}
                  disabled={!canCreate || isCreating}
                  label="Create note"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                </ToolbarIconButton>
                <FolderActionsDropdown
                  selectedFolder={selectedConcreteFolder}
                  canCreate={canCreate && !isCreating}
                  onCreateFolder={onCreateFolder}
                  onImportMarkdown={onImportMarkdown}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onOpenPalette={onOpenPalette}
                />
                <ToolbarIconButton
                  onClick={onToggleCollapsed}
                  aria-controls={id}
                  aria-expanded={true}
                  label="Collapse note navigator"
                >
                  <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
                </ToolbarIconButton>
              </>
            )}
          />
          <div className="space-y-1 border-b border-border-default px-3 pb-2 pt-2">
            <NoteFinderToolbar
              state={finderState}
              selectedFolderId={selectedFolderId}
              options={finderOptions}
              onChange={onFinderStateChange}
            />
            <TagBrowser
              tags={tagIndex}
              activeTags={finderState.tagFilters}
              isLoading={isLoading}
              onTagToggle={handleTagToggle}
            />

            {!hasToken ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className={`flex w-full items-center gap-2 rounded-md border border-border-default bg-background-default px-3 py-2 text-left text-sm text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default ${FOCUS_RING_CLASS}`}
              >
                <AlertCircle aria-hidden="true" className="h-4 w-4" />
                <span>Configure HackMD API Token</span>
              </button>
            ) : null}

            <RepositoryNotice error={activeError} cached={showingCachedFallback} />
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
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
              <div className="min-w-0 space-y-1">
                {entries.map((entry) => (
                  <NoteRow
                    key={`${entry.folderLabel}:${entry.note.id}`}
                    entry={entry}
                    selected={entry.note.id === selectedNoteId}
                    onSelect={onNoteSelect}
                    onOpen={onOpenNote}
                    onCopyLink={onCopyNoteLink}
                    onCopyMarkdownLink={onCopyNoteMarkdownLink}
                    onDuplicate={onDuplicateNote}
                    onExportMarkdown={onExportNoteMarkdown}
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
                  <div className="grid min-w-0 gap-0.5">
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
                      onNoteCopyLink={onCopyNoteLink}
                      onNoteCopyMarkdownLink={onCopyNoteMarkdownLink}
                      onNoteDuplicate={onDuplicateNote}
                      onNoteExportMarkdown={onExportNoteMarkdown}
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
                        onCopyLink={onCopyNoteLink}
                        onCopyMarkdownLink={onCopyNoteMarkdownLink}
                        onDuplicate={onDuplicateNote}
                        onExportMarkdown={onExportNoteMarkdown}
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
