import {
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
  Trash2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { NoteSummary } from '@/lib/electron-api';
import { buildNoteDragId, getNoteCurrentFolderId } from '@/lib/hackmd-note-dnd';
import type { FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { cn } from '@/lib/utils';

import { EntityRow } from './interaction-primitives';
import { COLLAPSE_ICON_CLASS, FOCUS_RING_CLASS, formatDate, getFolderTotalNoteCount } from './ui';
import { ROOT_FOLDER_DROP_ID } from '@/lib/hackmd-folder-dnd';
import { FolderGlyph } from './FolderNavigatorGlyph';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

const TREE_ROW_FOCUS_CLASS = 'focus-within:bg-background-selected focus-within:text-text-default focus-within:ring-2 focus-within:ring-focus-ring/80';

export function NoteRow({
  entry,
  selected,
  focusTarget = false,
  onSelect,
  onOpen,
  onCopyLink,
  onCopyMarkdownLink,
  onDuplicate,
  onExportMarkdown,
  onDelete,
  onRevealFolder,
  onRevealInFinder,
  onMoveToSelectedFolder,
  selectedFolder,
  draggable = false,
  disabledDrag = false,
  active = false,
  compact = false,
}: {
  entry: FolderTreeNote;
  selected: boolean;
  focusTarget?: boolean;
  onSelect: (note: NoteSummary) => void;
  onOpen: (note: NoteSummary) => void;
  onCopyLink: (note: NoteSummary) => void;
  onCopyMarkdownLink: (note: NoteSummary) => void;
  onDuplicate: (note: NoteSummary) => void;
  onExportMarkdown: (note: NoteSummary) => void;
  onDelete: (note: NoteSummary) => void;
  onRevealFolder: (entry: FolderTreeNote) => void;
  onRevealInFinder?: (note: NoteSummary) => void;
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
  const isLocalNote = entry.note.teamPath === LOCAL_VAULT_TEAM_PATH;

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
          data-folder-tree-row-id={`note:${entry.note.id}`}
          data-folder-tree-kind="note"
          data-folder-tree-note-id={entry.note.id}
          data-note-id={entry.note.id}
          className={cn('min-w-0', (isDragging || active) && 'opacity-40')}
        >
          <EntityRow
            selected={selected}
            icon={<FileText className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
            leadingControls={draggable ? (
              <button
                type="button"
                className={cn(
                  'flex h-6 w-5 shrink-0 items-center justify-center rounded text-text-subtle opacity-0 transition-opacity hover:text-text-default group-hover/entity-row:opacity-100 group-focus-within/entity-row:opacity-100 motion-reduce:transition-none',
                  FOCUS_RING_CLASS,
                )}
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
                data-folder-tree-primary="true"
                data-hackdesk-focus-target={focusTarget ? 'true' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(entry.note);
                }}
                className="block min-w-0 truncate rounded-[4px] text-left focus-visible:outline-none"
              >
                {entry.note.title || 'Untitled'}
              </button>
            )}
            subtitle={metadata || entry.note.shortId}
            trailing={formatDate(entry.note.updatedAtMillis)}
            trailingClassName="w-[7.25rem] truncate text-right"
            variant={compact ? 'compact' : 'default'}
            active={active}
            className={cn(TREE_ROW_FOCUS_CLASS, selected && 'bg-primary-soft')}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isLocalNote ? null : (
          <>
            <ContextMenuItem onSelect={() => onOpen(entry.note)}>
              <FileText aria-hidden="true" className="h-4 w-4" />
              Open in HackMD
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
          </>
        )}
        {isLocalNote && onRevealInFinder ? (
          <ContextMenuItem onSelect={() => onRevealInFinder(entry.note)}>
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            Reveal in Finder
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={() => onDuplicate(entry.note)}>
          <CopyPlus aria-hidden="true" className="h-4 w-4" />
          Duplicate Note
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onExportMarkdown(entry.note)}>
          <Download aria-hidden="true" className="h-4 w-4" />
          Export Markdown
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onRevealFolder(entry)}>
          <FolderOpen aria-hidden="true" className="h-4 w-4" />
          Reveal Folder
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
          {isLocalNote ? 'Move to Trash' : 'Delete'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function runAfterMenuClose(action: () => void) {
  window.setTimeout(action, 0);
}

export function FolderButton({
  node,
  selected,
  focusTarget = false,
  collapsed,
  active,
  noteDropTarget,
  onSelect,
  onToggle,
  onCreateFolderInside,
  onCreateNoteInside,
  onRenameFolder,
  onDeleteFolder,
  onRevealInFinder,
}: {
  node: FolderTreeNode;
  selected: boolean;
  focusTarget?: boolean;
  collapsed: boolean;
  active: boolean;
  noteDropTarget: boolean;
  onSelect: (folderId: string) => void;
  onToggle: (folderId: string) => void;
  onCreateFolderInside: (folderId: string) => void;
  onCreateNoteInside: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onRevealInFinder?: (folderId: string) => void;
}) {
  const hasChildren = node.children.length > 0 || node.notes.length > 0;
  const totalNotes = getFolderTotalNoteCount(node);
  const isLocalFolder = node.id.startsWith('local-folder:');
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
          data-folder-tree-row-id={`folder:${node.id}`}
          data-folder-tree-kind="folder"
          data-folder-tree-folder-id={node.id}
          data-folder-id={node.id}
          className={cn('min-w-0', (isDragging || active) && 'opacity-40')}
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
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-subtle hover:text-text-default disabled:pointer-events-none disabled:opacity-0',
                    FOCUS_RING_CLASS,
                  )}
                  aria-label={hasChildren ? (collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`) : undefined}
                  aria-expanded={hasChildren ? !collapsed : undefined}
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn('h-3.5 w-3.5', COLLAPSE_ICON_CLASS, !collapsed && 'rotate-90')}
                  />
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex h-6 w-5 shrink-0 items-center justify-center rounded text-text-subtle opacity-0 transition-opacity hover:text-text-default group-hover/entity-row:opacity-100 group-focus-within/entity-row:opacity-100 motion-reduce:transition-none',
                    FOCUS_RING_CLASS,
                  )}
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
                data-folder-tree-primary="true"
                data-hackdesk-focus-target={focusTarget ? 'true' : undefined}
                onClick={() => onSelect(node.id)}
                className="block min-w-0 truncate rounded-[4px] text-left focus-visible:outline-none"
              >
                {node.name}
              </button>
            )}
            trailing={totalNotes}
            className={TREE_ROW_FOCUS_CLASS}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onCreateNoteInside(node.id)}>
          <FileText aria-hidden="true" className="h-4 w-4" />
          New Note Inside
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCreateFolderInside(node.id)}>
          <FolderPlus aria-hidden="true" className="h-4 w-4" />
          New Folder Inside
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => runAfterMenuClose(() => onRenameFolder(node.id))}>
          <FolderPen aria-hidden="true" className="h-4 w-4" />
          Edit Folder
        </ContextMenuItem>
        {isLocalFolder && onRevealInFinder ? (
          <ContextMenuItem onSelect={() => onRevealInFinder(node.id)}>
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            Reveal in Finder
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem destructive onSelect={() => onDeleteFolder(node.id)}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {isLocalFolder ? 'Move to Trash' : 'Delete'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function RootFolderRow({
  selected,
  focusTarget = false,
  noteCount,
  folderDragActive,
  noteDragActive,
  onSelect,
  onCreateFolder,
  onCreateNote,
}: {
  selected: boolean;
  focusTarget?: boolean;
  noteCount: number;
  folderDragActive: boolean;
  noteDragActive: boolean;
  onSelect: () => void;
  onCreateFolder: () => void;
  onCreateNote: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_FOLDER_DROP_ID });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          className="min-w-0"
          data-folder-tree-row-id={`folder:${UNFILED_FOLDER_ID}`}
          data-folder-tree-kind="folder"
          data-folder-tree-folder-id={UNFILED_FOLDER_ID}
        >
          <EntityRow
            selected={selected || ((folderDragActive || noteDragActive) && isOver)}
            icon={<Folder className="h-3.5 w-3.5" />}
            title="Root"
            trailing={noteCount}
            variant="compact"
            className={TREE_ROW_FOCUS_CLASS}
            focusTarget={focusTarget}
            onClick={onSelect}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onCreateNote}>
          <FileText aria-hidden="true" className="h-4 w-4" />
          New Note
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCreateFolder}>
          <FolderPlus aria-hidden="true" className="h-4 w-4" />
          New Folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FolderDragOverlay({ node }: { node: FolderTreeNode | null }) {
  if (!node) {
    return null;
  }

  return (
    <div className="flex h-8 min-w-48 items-center gap-2 rounded-[6px] border border-border-default bg-background-default px-2 text-sm text-text-default shadow-lg">
      <FolderGlyph icon={node.icon} color={node.color} open />
      <span className="truncate">{node.name}</span>
    </div>
  );
}

export function NoteDragOverlay({ entry }: { entry: FolderTreeNote | null }) {
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

export function FolderTreeView({
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
  onCreateNoteInside,
  onRenameFolder,
  onDeleteFolder,
  onFolderRevealInFinder,
  onNoteSelect,
  onNoteOpen,
  onNoteCopyLink,
  onNoteCopyMarkdownLink,
  onNoteDuplicate,
  onNoteExportMarkdown,
  onNoteDelete,
  onNoteRevealFolder,
  onNoteRevealInFinder,
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
  onCreateNoteInside: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onFolderRevealInFinder?: (folderId: string) => void;
  onNoteSelect: (note: NoteSummary) => void;
  onNoteOpen: (note: NoteSummary) => void;
  onNoteCopyLink: (note: NoteSummary) => void;
  onNoteCopyMarkdownLink: (note: NoteSummary) => void;
  onNoteDuplicate: (note: NoteSummary) => void;
  onNoteExportMarkdown: (note: NoteSummary) => void;
  onNoteDelete: (note: NoteSummary) => void;
  onNoteRevealFolder: (entry: FolderTreeNote) => void;
  onNoteRevealInFinder?: (note: NoteSummary) => void;
  onNoteMoveToSelectedFolder: (entry: FolderTreeNote) => void;
  selectedFolderForNoteMove: FolderTreeNode | null;
  isMovingNote: boolean;
}) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className={cn('grid min-w-0 gap-0.5', depth > 0 && 'relative pl-5')}>
      {depth > 0 ? <div className="absolute left-[13px] top-1 bottom-1 w-px bg-border-default/70" aria-hidden="true" /> : null}
      {nodes.map((node) => {
        const collapsed = collapsedFolderIds.has(node.id);
        const isActiveFolder = activeFolderId === node.id;

        return (
          <div key={node.id} className="min-w-0">
            <FolderButton
              node={node}
              selected={selectedFolderId === node.id}
              focusTarget={selectedFolderId === node.id && !selectedNoteId}
              collapsed={collapsed}
              active={isActiveFolder}
              noteDropTarget={Boolean(activeNoteId)}
              onSelect={onFolderSelect}
              onToggle={onFolderToggle}
              onCreateFolderInside={onCreateFolderInside}
              onCreateNoteInside={onCreateNoteInside}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onRevealInFinder={onFolderRevealInFinder}
            />
            <div
              className={cn(
                'grid overflow-hidden transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none',
                !collapsed && !isActiveFolder ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
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
                    onCreateNoteInside={onCreateNoteInside}
                    onRenameFolder={onRenameFolder}
                    onDeleteFolder={onDeleteFolder}
                    onFolderRevealInFinder={onFolderRevealInFinder}
                    onNoteSelect={onNoteSelect}
                    onNoteOpen={onNoteOpen}
                    onNoteCopyLink={onNoteCopyLink}
                    onNoteCopyMarkdownLink={onNoteCopyMarkdownLink}
                    onNoteDuplicate={onNoteDuplicate}
                    onNoteExportMarkdown={onNoteExportMarkdown}
                    onNoteDelete={onNoteDelete}
                    onNoteRevealFolder={onNoteRevealFolder}
                    onNoteRevealInFinder={onNoteRevealInFinder}
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
                        focusTarget={entry.note.id === selectedNoteId}
                        onSelect={onNoteSelect}
                        onOpen={onNoteOpen}
                        onCopyLink={onNoteCopyLink}
                        onCopyMarkdownLink={onNoteCopyMarkdownLink}
                        onDuplicate={onNoteDuplicate}
                        onExportMarkdown={onNoteExportMarkdown}
                        onDelete={onNoteDelete}
                        onRevealFolder={onNoteRevealFolder}
                        onRevealInFinder={onNoteRevealInFinder}
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

export function NoteListSkeleton() {
  return (
    <div className="space-y-2 px-2 py-3" aria-label="Loading notes">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="size-4 animate-pulse rounded bg-background-selected motion-reduce:animate-none" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 animate-pulse rounded bg-background-selected motion-reduce:animate-none" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-background-default motion-reduce:animate-none" />
          </div>
          <div className="h-3 w-14 animate-pulse rounded bg-background-selected motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
