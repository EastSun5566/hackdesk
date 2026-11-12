import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCopy,
  Copy,
  CopyPlus,
  Download,
  FileText,
  FolderOpen,
  FolderPen,
  FolderPlus,
  GripVertical,
  History,
  LayoutTemplate,
  MoreVertical,
  Lock,
  Plus,
  Tag,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEventHandler, type PointerEventHandler, type ReactNode } from 'react';
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
import { buildNoteDragId } from '@/lib/hackmd-note-dnd';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { createTagGroupFocusId } from '@/lib/electron-tag-groups';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { ActionMenuShortcut, useActionShortcut } from './ActionShortcutContext';
import { EntityRow } from './interaction-primitives';
import { NoteSummaryCard } from './NoteSummaryCard';
import { COLLAPSE_ICON_CLASS, FOCUS_RING_INSET_CLASS, formatCompactDate, formatDate } from './ui';
import { ROOT_FOLDER_DROP_ID } from '@/lib/hackmd-folder-dnd';
import { FolderGlyph } from './FolderNavigatorGlyph';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { useRowOverlays } from './row-overlays';
import { readStringArrayStorage, writeStringArrayStorage } from './ui-preferences';
import { NoteKindIcon, useNoteKind, type NoteKind } from './note-kind';
import { NoteMatchSnippet } from './NoteMatchSnippet';

import { WORKSPACE_ROOT_FOCUS_ID } from './folder-tree-focus';
import { useFolderTreeControlId, useFolderTreeGroupId, useFolderTreeItem } from './FolderTreeFocusContext';
import type { WorkspaceScope } from './types';

export const RowOperationsContext = createContext<{
  renameNote?: (note: NoteSummary, name: string) => void;
  renameFolder?: (id: string, name: string) => void;
  moveNote?: (note: NoteSummary) => void;
  moveFolder?: (id: string) => void;
  copyNoteContent?: (note: NoteSummary) => void;
}>({});

function InlineName({ value, label, icon, height, onCancel, onSave }: { value: string; label: string; icon: ReactNode; height: 'folder' | 'note' | 'detail'; onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(value);
  return <form className={cn('flex min-w-0 items-center gap-1.5 rounded bg-background-primary-subtler px-2 py-1 text-sm leading-5 ring-2 ring-inset ring-focus-ring/80', height === 'folder' || height === 'note' ? 'h-8' : 'h-13 px-2.5 py-1.5')} onSubmit={(event) => { event.preventDefault(); const next = name.trim(); if (next && next !== value) onSave(next); else onCancel(); }}>
    <span aria-hidden="true" className="flex w-3.5 shrink-0 items-center justify-center text-icon-subtle">{icon}</span>
    <input aria-label={label} autoFocus value={name} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setName(event.target.value)} onBlur={onCancel} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); onCancel(); } }} className="min-w-0 flex-1 bg-transparent p-0 text-sm leading-5 text-text-default outline-none" />
  </form>;
}

function RowMenuButton({ label, tabIndex }: { label: string; tabIndex?: number }) {
  return <Tooltip content="Folder actions"><button type="button" aria-label={label} tabIndex={tabIndex} data-folder-tree-ignore-keyboard="true" className={cn('flex size-6 items-center justify-center rounded text-icon-subtle hover:text-text-default', FOCUS_RING_INSET_CLASS)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom })); }}><MoreVertical aria-hidden="true" className="size-3.5" /></button></Tooltip>;
}

// The search box keeps focus, so its highlighted result shows only while the box is focused.
const SEARCH_HIGHLIGHT_CLASS = '[.note-navigator:has(input[name=noteSearch]:focus)_&]:ring-2 [.note-navigator:has(input[name=noteSearch]:focus)_&]:ring-inset [.note-navigator:has(input[name=noteSearch]:focus)_&]:ring-focus-ring/80';
const TREE_ROW_FOCUS_CLASS = 'focus-within:bg-background-primary-subtler focus-within:text-text-emphasize focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus-ring/80';
/**
 * Children indent 20px; each guide runs 6px before the row, under the parent icon's centre. An
 * indented item reaches back over its indent and down over the 2px gap below it, so its guide
 * shows and meets the next one: lazy rows (content-visibility) paint only inside their own box.
 */
/**
 * Where a folder dragged with the pointer will land, set by FolderNavigator as
 * data-drop-placement on the target folder's row: inside lights the row up, before and after draw
 * a line in the gap above or below it.
 */
const FOLDER_DROP_MARK_CLASS = cn(
  'relative',
  'data-[drop-placement=inside]:*:bg-background-primary-subtler data-[drop-placement=inside]:*:text-text-emphasize',
  'data-[drop-placement=before]:before:absolute data-[drop-placement=before]:before:inset-x-0 data-[drop-placement=before]:before:-top-0.5 data-[drop-placement=before]:before:h-0.5 data-[drop-placement=before]:before:rounded-full data-[drop-placement=before]:before:bg-primary-default',
  'data-[drop-placement=after]:after:absolute data-[drop-placement=after]:after:inset-x-0 data-[drop-placement=after]:after:-bottom-0.5 data-[drop-placement=after]:after:h-0.5 data-[drop-placement=after]:after:rounded-full data-[drop-placement=after]:after:bg-primary-default',
);

export const TREE_CHILDREN_INDENT_CLASS = 'pl-5';
export function treeItemClassName(indented: boolean, lazy = false) {
  return cn('relative min-w-0', indented && '-mb-0.5 -ml-5 pb-0.5 pl-5', lazy && 'tree-row-lazy');
}
export const TREE_GUIDE_CLASS = 'pointer-events-none absolute inset-y-0 left-3.5 w-px bg-border-subtle';


/**
 * Note rows re-render only when their data changes. Lists hold hundreds of them, each with a menu,
 * a hover card and drag hooks, so re-rendering all of them on every search keystroke was slow.
 * Callbacks are skipped in the comparison: they come from stable wrappers (useStableCallbacks) or
 * are thin arrows over props that are compared.
 */
function areNoteRowPropsEqual(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (typeof previous[key] === 'function' && typeof next[key] === 'function') continue;
    if (!Object.is(previous[key], next[key])) return false;
  }
  return true;
}

type DragListeners = ReturnType<typeof useDraggable>['listeners'];

/**
 * How a note row starts a pointer drag. `start` is the armed hook's listener. A press that comes
 * before the row is armed (the tree moved under a still pointer, so it never entered) waits in
 * `pending` and is handed over as soon as the hook mounts, in the same task.
 */
type RowDragStart = { current: { start: PointerEventHandler | null; pending: Parameters<PointerEventHandler>[0] | null } };

/** dnd-kit types its listeners as bare functions; the row takes the pointer one, the handle the key one. */
function pointerDragListener(listeners: DragListeners) {
  return listeners?.onPointerDown as PointerEventHandler | undefined;
}

function keyboardDragListener(listeners: DragListeners) {
  return listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined;
}

/**
 * The note's drag handle owns its drag hook. Drag-and-drop state is a context every draggable
 * reads, and it changes whenever the tree's drop targets do (a folder opening); keeping the hook
 * here re-renders this small button instead of the whole row. The row shows the drag through a
 * data attribute.
 *
 * The pointer drags the whole row: the hook hands its pointer listener to the row through
 * `rowDrag`. The handle keeps the keyboard drag, so a press never starts two drags.
 */
type NoteDragHandleProps = {
  noteId: string;
  rowDrag: RowDragStart;
  title: string;
  controlId?: string;
  tabIndex?: number;
  disabledDrag: boolean;
  compact: boolean;
  kind: NoteKind;
  onSelect: () => void;
};

const NOTE_DRAG_HANDLE_CLASS = cn(
  // Wider than its icon for an easier grab; the negative margins keep the icon on the same column
  // as folder icons.
  'group/drag-handle relative -mx-0.75 -my-2 flex h-10 w-5 shrink-0 items-center justify-center rounded text-icon-subtle group-hover/entity-row:text-icon-default hover:text-text-default',
  FOCUS_RING_INSET_CLASS,
);

function NoteDragHandleGlyphs({ compact, kind }: { compact: boolean; kind: NoteKind }) {
  return <NoteKindIcon kind={kind} className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />;
}

/**
 * Hundreds of rows each holding a drag hook re-rendered on every drag-context change (switching
 * tabs, opening folders). A row arms its drag hook only while pointed at or focused; before that
 * the handle is a plain button that looks the same.
 */
function NoteDragHandle({ armed, ...props }: NoteDragHandleProps & { armed: boolean }) {
  if (armed) return <LiveNoteDragHandle {...props} />;
  return (
    <button
      type="button"
      id={props.controlId}
      className={NOTE_DRAG_HANDLE_CLASS}
      aria-label={`Drag ${props.title}`}
      data-folder-tree-ignore-keyboard="true"
      onClick={(event) => {
        event.stopPropagation();
        if (!props.disabledDrag) props.onSelect();
      }}
      tabIndex={props.tabIndex}
      aria-disabled={props.disabledDrag || undefined}
    >
      <NoteDragHandleGlyphs compact={props.compact} kind={props.kind} />
    </button>
  );
}

function LiveNoteDragHandle({
  noteId,
  rowDrag,
  title,
  controlId,
  tabIndex,
  disabledDrag,
  compact,
  kind,
  onSelect,
}: NoteDragHandleProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: buildNoteDragId(noteId),
    disabled: disabledDrag,
  });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    buttonRef.current?.closest('[data-folder-tree-row-id]')?.toggleAttribute('data-hackdesk-dragging', isDragging);
  }, [isDragging]);
  const onPointerDown = disabledDrag ? undefined : pointerDragListener(listeners);
  useLayoutEffect(() => {
    const drag = rowDrag.current;
    drag.start = onPointerDown ?? null;
    const pending = drag.pending;
    drag.pending = null;
    if (pending) onPointerDown?.(pending);
    return () => { drag.start = null; };
  }, [rowDrag, onPointerDown]);

  return (
    <button
      type="button"
      id={controlId}
      ref={(element) => {
        buttonRef.current = element;
        // The whole row is what moves, so the drag preview starts where the row is.
        setNodeRef(element?.closest<HTMLElement>('[data-folder-tree-row-id]') ?? element);
      }}
      className={NOTE_DRAG_HANDLE_CLASS}
      aria-label={`Drag ${title}`}
      data-folder-tree-ignore-keyboard="true"
      onClick={(event) => {
        event.stopPropagation();
        if (!disabledDrag) onSelect();
      }}
      {...attributes}
      onKeyDown={disabledDrag ? undefined : keyboardDragListener(listeners)}
      tabIndex={tabIndex}
      aria-disabled={disabledDrag || attributes['aria-disabled']}
    >
      <NoteDragHandleGlyphs compact={compact} kind={kind} />
    </button>
  );
}

function focusTreeRowPrimary(rowId: string) {
  const row = Array.from(document.querySelectorAll<HTMLElement>('[data-folder-tree-row-id]'))
    .find((candidate) => candidate.dataset.folderTreeRowId === rowId);
  const target = row?.querySelector<HTMLElement>('[data-folder-tree-primary="true"]')
    ?? row?.querySelector<HTMLElement>('button:not([disabled])');
  target?.focus();
}

function runAfterMenuClose(rowId: string, action: () => void) {
  window.setTimeout(() => {
    focusTreeRowPrimary(rowId);
    action();
  }, 0);
}

function NoteRowView({
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
  showInFolderAction = false,
  draggable = false,
  disabledDrag = false,
  active = false,
  compact = false,
  highlightId,
  snippet,
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
  showInFolderAction?: boolean;
  draggable?: boolean;
  disabledDrag?: boolean;
  active?: boolean;
  compact?: boolean;
  /** Marks the search result highlighted from the search box, and is the id it points to. */
  highlightId?: string;
  /** Where the note's text matched the search, shown in place of its folder and tags. */
  snippet?: string;
}) {
  const operations = useContext(RowOperationsContext);
  const [renaming, setRenaming] = useState(false);
  // In the tree a note already sits under its folder, so only search results name it.
  const metadata = [
    compact ? '' : entry.folderLabel,
    entry.note.tags.slice(0, 2).join(', '),
  ].filter(Boolean).join(' · ');
  const isLocalNote = entry.note.teamPath === LOCAL_VAULT_TEAM_PATH;
  const rowId = `note:${entry.note.id}`;
  const [dragArmed, setDragArmed] = useState(false);
  const rowDrag: RowDragStart = useRef({ start: null, pending: null });
  const treeItemProps = useFolderTreeItem(rowId, selected, undefined, draggable ? ['drag'] : []);
  const dragControlId = useFolderTreeControlId(rowId, 'drag');
  const canShowInFolder = showInFolderAction && entry.folderPath.length > 0;
  const kind = useNoteKind(entry.note);

  const overlayRef = useRowOverlays(
    () => (
      <>
        {isLocalNote ? null : (
          <>
            <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onOpen(entry.note))}>
              <FileText aria-hidden="true" className="h-4 w-4" />
              Open in HackMD
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onCopyLink(entry.note))}>
              <Copy aria-hidden="true" className="h-4 w-4" />
              Copy HackMD Link
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onCopyMarkdownLink(entry.note))}>
              <Copy aria-hidden="true" className="h-4 w-4" />
              Copy Markdown Link
            </ContextMenuItem>
          </>
        )}
        {operations.copyNoteContent ? (
          <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => operations.copyNoteContent?.(entry.note))}>
            <ClipboardCopy aria-hidden="true" className="h-4 w-4" />
            Copy Content
          </ContextMenuItem>
        ) : null}
        {isLocalNote && !operations.copyNoteContent ? null : <ContextMenuSeparator />}
        {isLocalNote && onRevealInFinder ? (
          <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onRevealInFinder(entry.note))}>
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            Reveal in Finder
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onDuplicate(entry.note))}>
          <CopyPlus aria-hidden="true" className="h-4 w-4" />
          Duplicate Note
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onExportMarkdown(entry.note))}>
          <Download aria-hidden="true" className="h-4 w-4" />
          Export Markdown
        </ContextMenuItem>
        {canShowInFolder ? (
          <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onRevealFolder(entry))}>
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            Show in Folder
          </ContextMenuItem>
        ) : null}
        {operations.renameNote ? <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => setRenaming(true))}><FolderPen aria-hidden="true" className="h-4 w-4" />Rename</ContextMenuItem> : null}
        <ContextMenuItem disabled={!operations.moveNote} onSelect={() => runAfterMenuClose(rowId, () => operations.moveNote?.(entry.note))}>
          <FolderOpen aria-hidden="true" className="h-4 w-4" />
          Move to…
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onSelect={() => runAfterMenuClose(rowId, () => onDelete(entry.note))}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {isLocalNote ? 'Move to Trash' : 'Delete'}
        </ContextMenuItem>
      </>
    ),
    () => <NoteSummaryCard entry={entry} />,
  );

  return (
    <div
      ref={overlayRef}
      id={highlightId}
      onPointerEnter={draggable && !dragArmed ? () => setDragArmed(true) : undefined}
      onFocus={draggable && !dragArmed ? () => setDragArmed(true) : undefined}
      // Pressing anywhere on the row can drag it; it starts after 4px of movement, so clicks stay clicks.
      onPointerDown={draggable ? (event) => {
        if (rowDrag.current.start) {
          rowDrag.current.start(event);
        } else if (!dragArmed) {
          rowDrag.current.pending = event;
          setDragArmed(true);
        }
      } : undefined}
      data-folder-tree-row-id={rowId}
      data-folder-tree-kind="note"
      data-folder-tree-note-id={entry.note.id}
      data-note-id={entry.note.id}
      className={cn('min-w-0 [&[data-hackdesk-dragging]]:opacity-40', active && 'opacity-40')}
    >
      {/* Hovering a row for a moment shows a card with the full title and what the one-line row
          leaves out: folder, tags and the edited date (see the RowOverlayHost). */}
      <div className="min-w-0">
        {renaming ? <InlineName value={entry.note.title || 'Untitled'} label="Rename note" height={compact ? 'note' : 'detail'} icon={<NoteKindIcon kind={kind} className="size-3.5" />} onCancel={() => setRenaming(false)} onSave={(name) => { setRenaming(false); operations.renameNote?.(entry.note, name); }} /> : <EntityRow
          selected={selected}
          icon={draggable || compact ? undefined : <NoteKindIcon kind={kind} className="h-4 w-4" />}
          leadingControls={draggable ? (
            <NoteDragHandle
              armed={dragArmed}
              noteId={entry.note.id}
              rowDrag={rowDrag}
              title={entry.note.title || 'Untitled'}
              controlId={dragControlId}
              tabIndex={treeItemProps?.tabIndex}
              disabledDrag={disabledDrag}
              compact={compact}
              kind={kind}
              onSelect={() => onSelect(entry.note)}
            />
          ) : compact ? <span aria-hidden="true" className="-mx-0.75 -my-2 flex h-10 w-5 shrink-0 items-center justify-center text-icon-subtle"><NoteKindIcon kind={kind} className="size-3.5" /></span> : null}
          title={entry.note.title || 'Untitled'}
          // In the tree a note is one line: its title, with the edited date as quiet trailing meta.
          // Search results add a second line for where the note lives or where the text matched.
          subtitle={snippet ? <NoteMatchSnippet snippet={snippet} /> : compact ? undefined : metadata || entry.note.shortId}
          trailing={(
            <time title={formatDate(entry.note.updatedAtMillis)} dateTime={entry.note.updatedAtMillis ? new Date(entry.note.updatedAtMillis).toISOString() : undefined}>
              {formatCompactDate(entry.note.updatedAtMillis)}
            </time>
          )}
          trailingClassName="note-row-date max-w-20 truncate text-right"
          variant={compact ? 'compact' : 'default'}
          active={active}
          contentOnClick={() => onSelect(entry.note)}
          contentAriaLabel={entry.note.title || 'Untitled'}
          contentAriaCurrent={treeItemProps ? undefined : selected ? 'page' : undefined}
          contentFocusTarget={focusTarget}
          contentButtonProps={treeItemProps}
          // The tree steps back from the editor: subtle text, full strength on hover and selection.
          tone="quiet"
          className={cn(TREE_ROW_FOCUS_CLASS, highlightId && SEARCH_HIGHLIGHT_CLASS)}
        />}
      </div>
    </div>
  );
}

function FolderButtonView({
  node,
  selected,
  focusTarget = false,
  collapsed,
  active,
  noteDropTarget,
  disabledDrag,
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
  disabledDrag: boolean;
  onSelect: (folderId: string) => void;
  onToggle: (folderId: string) => void;
  onCreateFolderInside: (folderId: string) => void;
  onCreateNoteInside: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onRevealInFinder?: (folderId: string) => void;
}) {
  const operations = useContext(RowOperationsContext);
  const [renaming, setRenaming] = useState(false);
  const hasChildren = node.children.length > 0 || node.notes.length > 0;
  const isLocalFolder = node.id.startsWith('local-folder:');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: node.id, disabled: disabledDrag });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const rowId = `folder:${node.id}`;
  const treeItemProps = useFolderTreeItem(rowId, selected, hasChildren ? !collapsed : undefined, hasChildren ? ['toggle', 'drag'] : ['drag']);
  const dragControlId = useFolderTreeControlId(rowId, 'drag');
  const toggleControlId = useFolderTreeControlId(rowId, 'toggle');

  const overlayRef = useRowOverlays(() => (
    <>
      <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onCreateNoteInside(node.id))}>
        <FileText aria-hidden="true" className="h-4 w-4" />
        New Note Inside
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onCreateFolderInside(node.id))}>
        <FolderPlus aria-hidden="true" className="h-4 w-4" />
        New Folder Inside
      </ContextMenuItem>
      <ContextMenuSeparator />
      {operations.renameFolder ? <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => setRenaming(true))}>
        <FolderPen aria-hidden="true" className="h-4 w-4" />
        Rename
      </ContextMenuItem> : null}
      <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onRenameFolder(node.id))}><FolderPen aria-hidden="true" className="h-4 w-4" />Edit Folder</ContextMenuItem>
      {operations.moveFolder ? <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => operations.moveFolder?.(node.id))}><FolderOpen aria-hidden="true" className="h-4 w-4" />Move to…</ContextMenuItem> : null}
      {isLocalFolder && onRevealInFinder ? (
        <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onRevealInFinder(node.id))}>
          <FolderOpen aria-hidden="true" className="h-4 w-4" />
          Reveal in Finder
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem destructive onSelect={() => runAfterMenuClose(rowId, () => onDeleteFolder(node.id))}>
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        {isLocalFolder ? 'Move to Trash' : 'Delete'}
      </ContextMenuItem>
    </>
  ));
  // The row is both the drag-and-drop node and where its menu opens.
  const rowRef = useCallback((element: HTMLDivElement | null) => {
    setNodeRef(element);
    overlayRef(element);
  }, [setNodeRef, overlayRef]);

  return (
    <div
      ref={rowRef}
      style={style}
      data-folder-tree-row-id={rowId}
      data-folder-tree-kind="folder"
      data-folder-tree-folder-id={node.id}
      data-folder-id={node.id}
      data-hackdesk-dragging={isDragging || undefined}
      // Pressing anywhere on the row can drag it; it starts after 4px of movement, so clicks stay clicks.
      onPointerDown={disabledDrag ? undefined : pointerDragListener(listeners)}
      className={cn('min-w-0', FOLDER_DROP_MARK_CLASS, (isDragging || active) && 'opacity-40')}
    >
      {renaming ? <InlineName value={node.name} label="Rename folder" height="folder" icon={<FolderGlyph icon={node.icon} color={node.color} open={!collapsed} />} onCancel={() => setRenaming(false)} onSave={(name) => { setRenaming(false); operations.renameFolder?.(node.id, name); }} /> : <EntityRow
        selected={selected}
        active={noteDropTarget && isOver}
        variant="compact"
        // The icon slot lines up with note icons at the same level. Hovering or focusing the row
        // turns the folder icon into the expand arrow in that same spot (as on HackMD web). The
        // row itself drags; the drag button just left of the icon is for the keyboard, and shows
        // only while it has keyboard focus.
        leadingControls={(
          <span className="relative flex items-center">
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              id={toggleControlId}
              disabled={!hasChildren}
              className={cn(
                '-mx-0.75 -my-2 flex h-10 w-5 shrink-0 items-center justify-center rounded text-icon-subtle group-hover/entity-row:text-icon-default hover:text-text-default disabled:pointer-events-none',
                FOCUS_RING_INSET_CLASS,
              )}
              aria-label={hasChildren ? (collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`) : `${node.name}, empty`}
              aria-expanded={hasChildren ? !collapsed : undefined}
              tabIndex={treeItemProps?.tabIndex}
            >
              <span className={cn(hasChildren && 'group-hover/entity-row:hidden group-focus-within/entity-row:hidden')}>
                <FolderGlyph icon={node.icon} color={node.color} open={!collapsed} />
              </span>
              {hasChildren ? (
                <ChevronRight
                  aria-hidden="true"
                  className={cn('hidden size-3.5 group-hover/entity-row:block group-focus-within/entity-row:block', COLLAPSE_ICON_CLASS, !collapsed && 'rotate-90')}
                />
              ) : null}
            </button>
            <button
              type="button"
              className={cn(
                'absolute -left-3.5 top-1/2 flex h-6 w-3 -translate-y-1/2 items-center justify-center rounded-sm text-icon-subtle opacity-0 transition-opacity focus-visible:opacity-100 motion-reduce:transition-none',
                disabledDrag && 'pointer-events-none',
                FOCUS_RING_INSET_CLASS,
              )}
              aria-label={`Drag ${node.name}`}
              id={dragControlId}
              data-folder-tree-ignore-keyboard="true"
              {...attributes}
              onKeyDown={disabledDrag ? undefined : keyboardDragListener(listeners)}
              tabIndex={treeItemProps?.tabIndex}
              aria-disabled={disabledDrag || attributes['aria-disabled']}
            >
              <GripVertical aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        )}
        title={node.name}
        // Clicking the row selects the folder and toggles it, like the arrow: selecting opens a
        // closed folder, and a second click closes it again.
        contentOnClick={() => {
          onSelect(node.id);
          if (hasChildren && !collapsed) onToggle(node.id);
        }}
        contentAriaLabel={node.name}
        contentAriaCurrent={treeItemProps ? undefined : selected ? 'page' : undefined}
        contentFocusTarget={focusTarget}
        contentButtonProps={treeItemProps}
        tone="quiet"
        menu={<span className="flex"><Tooltip content="New Note"><button type="button" aria-label={`New note in ${node.name}`} data-folder-tree-ignore-keyboard="true" tabIndex={treeItemProps?.tabIndex} className={cn('flex size-6 items-center justify-center rounded text-icon-subtle hover:text-text-default', FOCUS_RING_INSET_CLASS)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onCreateNoteInside(node.id); }}><Plus aria-hidden="true" className="size-3.5" /></button></Tooltip><Tooltip content="New Folder"><button type="button" aria-label={`New folder in ${node.name}`} data-folder-tree-ignore-keyboard="true" tabIndex={treeItemProps?.tabIndex} className={cn('flex size-6 items-center justify-center rounded text-icon-subtle hover:text-text-default', FOCUS_RING_INSET_CLASS)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onCreateFolderInside(node.id); }}><FolderPlus aria-hidden="true" className="size-3.5" /></button></Tooltip><RowMenuButton label={`Folder actions for ${node.name}`} tabIndex={treeItemProps?.tabIndex} /></span>}
        className={TREE_ROW_FOCUS_CLASS}
      />}
    </div>
  );
}

function NewNoteTooltip() {
  const shortcut = useActionShortcut('new-note');
  return <span className="inline-flex items-center gap-2">New Note{shortcut ? <kbd className="text-text-subtle">{shortcut}</kbd> : null}</span>;
}

export function WorkspaceRootScopeIcon({ scope }: { scope: WorkspaceScope }) {
  if (scope.type === 'team') return <Users className="h-3.5 w-3.5" />;
  if (scope.type === 'local') return <FolderOpen className="h-3.5 w-3.5" />;
  return <Lock className="h-3.5 w-3.5" />;
}

/** Drag ids for the folders of a working set, kept apart from note and folder ids in the tree. */
export const WORKSPACE_FOLDER_DRAG_PREFIX = 'workspace-folder:';
export function buildWorkspaceFolderDragId(vaultId: string) {
  return `${WORKSPACE_FOLDER_DRAG_PREFIX}${vaultId}`;
}
export function parseWorkspaceFolderDragId(id: string) {
  return id.startsWith(WORKSPACE_FOLDER_DRAG_PREFIX) ? id.slice(WORKSPACE_FOLDER_DRAG_PREFIX.length) : null;
}

/**
 * A folder in the open working set, with its notes below. The header row drags to reorder the set
 * (the whole section is the drop target) and its menu moves it up or down; the active folder hides
 * or shows its notes, the others open themselves.
 */
export function WorkspaceFolderSection({
  id,
  label,
  path,
  active,
  expanded,
  dropPlacement,
  dragging,
  canMoveUp,
  canMoveDown,
  onOpen,
  onToggle,
  onMove,
  onCreateNote,
  onCreateFolder,
  children,
}: {
  id: string;
  label: string;
  path: string;
  active: boolean;
  expanded: boolean;
  dropPlacement: 'before' | 'after' | null;
  /** This section is the one being dragged. */
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onMove?: (direction: -1 | 1) => void;
  onCreateNote?: () => void;
  onCreateFolder?: () => void;
  children: ReactNode;
}) {
  const dragId = buildWorkspaceFolderDragId(id);
  const reorderable = Boolean(onMove) && (canMoveUp || canMoveDown);
  const { setNodeRef: setDropRef } = useDroppable({ id: dragId, disabled: !reorderable });
  const { listeners, setNodeRef: setDragRef } = useDraggable({ id: dragId, disabled: !reorderable });
  return (
    <li
      ref={setDropRef}
      data-workspace-folder-id={id}
      data-drop-placement={dropPlacement ?? undefined}
      className={cn('grid min-w-0 gap-0.5', FOLDER_DROP_MARK_CLASS, dragging && 'opacity-50')}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div ref={setDragRef} onPointerDown={reorderable ? pointerDragListener(listeners) : undefined}>
            <EntityRow
              variant="compact"
              tone="quiet"
              selected={active}
              leadingControls={(
                <button
                  type="button"
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
                  aria-expanded={expanded}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle();
                  }}
                  className={cn(
                    'flex h-6 w-5 shrink-0 items-center justify-center rounded-sm text-icon-subtle hover:text-text-default',
                    FOCUS_RING_INSET_CLASS,
                  )}
                >
                  <ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
                </button>
              )}
              icon={<FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />}
              title={label}
              titleAttribute={path}
              contentOnClick={onOpen}
              contentAriaLabel={active ? `Hide ${label} notes` : `Open ${label}`}
              contentAriaCurrent={active ? 'page' : undefined}
              contentButtonProps={reorderable ? {
                'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown',
                onKeyDown: (event) => {
                  if (!event.altKey || event.metaKey || event.ctrlKey) return;
                  if (event.key === 'ArrowUp' && canMoveUp) {
                    event.preventDefault();
                    onMove?.(-1);
                  } else if (event.key === 'ArrowDown' && canMoveDown) {
                    event.preventDefault();
                    onMove?.(1);
                  }
                },
              } : undefined}
              contentFocusTarget
              menu={<span className="flex">{onCreateNote ? <Tooltip content="New Note"><button type="button" aria-label={`New note in ${label}`} className={cn('flex size-6 items-center justify-center rounded text-icon-subtle hover:text-text-default', FOCUS_RING_INSET_CLASS)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onCreateNote(); }}><Plus className="size-3.5" /></button></Tooltip> : null}{onCreateFolder ? <Tooltip content="New Folder"><button type="button" aria-label={`New folder in ${label}`} className={cn('flex size-6 items-center justify-center rounded text-icon-subtle hover:text-text-default', FOCUS_RING_INSET_CLASS)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onCreateFolder(); }}><FolderPlus className="size-3.5" /></button></Tooltip> : null}</span>}
              className={TREE_ROW_FOCUS_CLASS}
            />
          </div>
        </ContextMenuTrigger>
        {reorderable ? (
          <ContextMenuContent>
            <ContextMenuItem disabled={!canMoveUp} onSelect={() => onMove?.(-1)}>
              <ArrowUp aria-hidden="true" className="h-4 w-4" />
              Move Up
            </ContextMenuItem>
            <ContextMenuItem disabled={!canMoveDown} onSelect={() => onMove?.(1)}>
              <ArrowDown aria-hidden="true" className="h-4 w-4" />
              Move Down
            </ContextMenuItem>
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
      {expanded ? (
        <ul
          role="group"
          aria-label={`${label} notes`}
          className={cn('m-0 grid min-w-0 list-none gap-0.5 p-0', TREE_CHILDREN_INDENT_CLASS)}
        >
          {children}
        </ul>
      ) : null}
    </li>
  );
}

function PreviewNoteRow({ entry, onOpenNote }: { entry: FolderTreeNote; onOpenNote: (note: NoteSummary) => void }) {
  const kind = useNoteKind(entry.note);
  return (
    <EntityRow
      variant="compact"
      tone="quiet"
      leadingControls={<span aria-hidden="true" className="-mx-0.75 -my-2 flex h-10 w-5 shrink-0 items-center justify-center text-icon-subtle"><NoteKindIcon kind={kind} className="h-3.5 w-3.5" /></span>}
      title={entry.note.title || 'Untitled'}
      trailing={(
        <time title={formatDate(entry.note.updatedAtMillis)} dateTime={entry.note.updatedAtMillis ? new Date(entry.note.updatedAtMillis).toISOString() : undefined}>
          {formatCompactDate(entry.note.updatedAtMillis)}
        </time>
      )}
      trailingClassName="note-row-date max-w-20 truncate text-right"
      contentOnClick={() => onOpenNote(entry.note)}
      contentAriaLabel={entry.note.title || 'Untitled'}
      contentFocusTarget
      className={TREE_ROW_FOCUS_CLASS}
    />
  );
}

type PreviewFolderAction = 'create-note' | 'create-folder' | 'rename' | 'move' | 'edit' | 'delete' | 'reveal';

function PreviewFolderRow({ node, expanded, folderLabel, onOpen, onToggle, onAction }: {
  node: FolderTreeNode; expanded: boolean; folderLabel: string; onOpen: () => void; onToggle: () => void;
  onAction: (action: PreviewFolderAction, name?: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const hasChildren = node.children.length > 0 || node.notes.length > 0;
  const rowId = `preview-folder:${folderLabel}:${node.id}`;
  const overlayRef = useRowOverlays(() => <>
    <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onAction('create-note'))}><FileText className="size-4" />New Note Inside</ContextMenuItem>
    <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onAction('create-folder'))}><FolderPlus className="size-4" />New Folder Inside</ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => setRenaming(true))}><FolderPen className="size-4" />Rename</ContextMenuItem>
    <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onAction('move'))}><FolderOpen className="size-4" />Move to…</ContextMenuItem>
    <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onAction('edit'))}><FolderPen className="size-4" />Edit Folder</ContextMenuItem>
    <ContextMenuItem onSelect={() => runAfterMenuClose(rowId, () => onAction('reveal'))}><FolderOpen className="size-4" />Reveal in Finder</ContextMenuItem>
    <ContextMenuItem destructive onSelect={() => runAfterMenuClose(rowId, () => onAction('delete'))}><Trash2 className="size-4" />Move to Trash</ContextMenuItem>
  </>);
  return <div ref={overlayRef} data-folder-tree-row-id={rowId}>
    {renaming ? <InlineName value={node.name} label="Rename folder" height="folder" icon={<FolderGlyph icon={node.icon} color={node.color} open={expanded} />} onCancel={() => setRenaming(false)} onSave={(name) => { setRenaming(false); onAction('rename', name); }} /> : <EntityRow
      variant="compact" tone="quiet"
      leadingControls={hasChildren ? <button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`} aria-expanded={expanded} onClick={(event) => { event.stopPropagation(); onToggle(); }} className={cn('flex h-6 w-5 shrink-0 items-center justify-center rounded-sm text-icon-subtle hover:text-text-default', FOCUS_RING_INSET_CLASS)}><ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} /></button> : <span className="h-6 w-5 shrink-0" aria-hidden="true" />}
      icon={<FolderGlyph icon={node.icon} color={node.color} open={expanded} />} title={node.name}
      contentOnClick={onOpen} contentAriaLabel={`Open ${node.name} in ${folderLabel}`} contentFocusTarget className={TREE_ROW_FOCUS_CLASS}
      menu={<span className="flex"><Tooltip content="New Note"><button type="button" aria-label={`New note in ${node.name}`} className={cn('flex size-6 items-center justify-center rounded text-icon-subtle hover:text-text-default', FOCUS_RING_INSET_CLASS)} onClick={(event) => { event.stopPropagation(); onAction('create-note'); }}><Plus className="size-3.5" /></button></Tooltip><Tooltip content="New Folder"><button type="button" aria-label={`New folder in ${node.name}`} className={cn('flex size-6 items-center justify-center rounded text-icon-subtle hover:text-text-default', FOCUS_RING_INSET_CLASS)} onClick={(event) => { event.stopPropagation(); onAction('create-folder'); }}><FolderPlus className="size-3.5" /></button></Tooltip><RowMenuButton label={`Folder actions for ${node.name}`} /></span>}
    />}
  </div>;
}

function PreviewNodes({
  expandedFolderIds,
  depth,
  folderLabel,
  nodes,
  notes,
  onOpenFolder,
  onOpenNote,
  onToggleFolder,
  onFolderAction,
}: {
  expandedFolderIds: Set<string>;
  depth: number;
  folderLabel: string;
  nodes: FolderTreeNode[];
  notes: FolderTreeNote[];
  onOpenFolder: (folderId: string, folderIds: string[]) => void;
  onOpenNote: (note: NoteSummary) => void;
  onToggleFolder: (folderId: string) => void;
  onFolderAction: (folderIds: string[], action: PreviewFolderAction, name?: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const expanded = expandedFolderIds.has(node.id);
        const folderIds = node.folderPath.map((folder) => folder.id);
        return (
          <li key={node.id} className="grid min-w-0 gap-0.5">
            <div className="pl-(--preview-indent)" style={{ '--preview-indent': `${depth * 12}px` } as CSSProperties}>
              <PreviewFolderRow node={node} expanded={expanded} folderLabel={folderLabel} onOpen={() => onOpenFolder(node.id, folderIds)} onToggle={() => onToggleFolder(node.id)} onAction={(action, name) => onFolderAction(folderIds, action, name)} />
            </div>
            {expanded ? (
              <ul role="group" aria-label={node.name} className="m-0 grid min-w-0 list-none gap-0.5 p-0">
                <PreviewNodes
                  expandedFolderIds={expandedFolderIds}
                  depth={depth + 1}
                  folderLabel={folderLabel}
                  nodes={node.children}
                  notes={node.notes}
                  onOpenFolder={onOpenFolder}
                  onOpenNote={onOpenNote}
                  onToggleFolder={onToggleFolder}
                  onFolderAction={onFolderAction}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
      {notes.map((entry) => (
        <li
          key={`note:${entry.note.id}`}
          data-workspace-note-id={entry.note.id}
          className="grid min-w-0 gap-0.5 pl-(--preview-indent)"
          style={{ '--preview-indent': `${depth * 12}px` } as CSSProperties}
        >
          <PreviewNoteRow entry={entry} onOpenNote={onOpenNote} />
        </li>
      ))}
    </>
  );
}

/**
 * Another folder in the open working set, shown read-only inside the navigator. Selecting anything
 * in it activates that folder first; edits stay with the active folder's own tree.
 */
export function WorkspaceFolderPreview({
  error,
  expandedStorageKey,
  expandCommand,
  folderLabel,
  isLoading,
  onOpenFolder,
  onOpenNote,
  onFolderAction,
  tree,
}: {
  error: string | null;
  /** Where the live tree keeps this folder's expanded sub-folders; the preview shares it. */
  expandedStorageKey: string | null;
  expandCommand?: { sequence: number; expanded: boolean };
  folderLabel: string;
  isLoading: boolean;
  onOpenFolder: (folderId: string, folderIds: string[]) => void;
  onOpenNote: (note: NoteSummary) => void;
  onFolderAction: (folderIds: string[], action: PreviewFolderAction, name?: string) => void;
  tree: FolderTree;
}) {
  // Sub-folders start closed, like the live tree, and keep whatever the folder showed while open.
  const [expanded, setExpanded] = useState(() => ({
    key: expandedStorageKey,
    ids: expandedStorageKey ? readStringArrayStorage(expandedStorageKey) : new Set<string>(),
  }));
  const appliedCommand = useRef<{ key: string | null; sequence: number } | null>(null);
  useEffect(() => {
    if (!expandCommand || isLoading || error) return;
    if (appliedCommand.current?.key === expandedStorageKey && appliedCommand.current.sequence === expandCommand.sequence) return;
    const ids = new Set(expandCommand.expanded ? tree.nodesById.keys() : []);
    if (expandedStorageKey) writeStringArrayStorage(expandedStorageKey, ids);
    appliedCommand.current = { key: expandedStorageKey, sequence: expandCommand.sequence };
    setExpanded({ key: expandedStorageKey, ids });
  }, [expandCommand, expandedStorageKey, tree, isLoading, error]);
  if (expanded.key !== expandedStorageKey) {
    setExpanded({
      key: expandedStorageKey,
      ids: expandedStorageKey ? readStringArrayStorage(expandedStorageKey) : new Set<string>(),
    });
  }
  if (isLoading) {
    return <li role="presentation" className="py-0.5 pl-1"><NoteListSkeleton /></li>;
  }
  if (error) {
    return <li role="presentation" className="px-2 py-1 text-xs text-text-subtle">{error}</li>;
  }
  if (tree.roots.length === 0 && tree.unfiled.notes.length === 0) {
    return <li role="presentation" className="px-2 py-1 text-xs text-text-subtle">No notes yet.</li>;
  }
  return (
    <PreviewNodes
      expandedFolderIds={expanded.ids}
      depth={0}
      folderLabel={folderLabel}
      nodes={tree.roots}
      notes={tree.unfiled.notes}
      onOpenFolder={onOpenFolder}
      onOpenNote={onOpenNote}
      onFolderAction={onFolderAction}
      onToggleFolder={(folderId) => {
        setExpanded((current) => {
          const ids = new Set(current.ids);
          if (ids.has(folderId)) ids.delete(folderId);
          else ids.add(folderId);
          if (current.key) writeStringArrayStorage(current.key, ids);
          return { ...current, ids };
        });
      }}
    />
  );
}

/**
 * Pinned workspace header row: collapse hides the folder tree; the row is also a top-level drop
 * target while dragging.
 */
export function WorkspaceRootTreeRow({
  scope,
  label,
  /** The open folder inside a named working set, shown beside the set's name. */
  detail,
  selected,
  sectionExpanded,
  dragActive,
  onSelectTopLevel,
  onSectionToggle,
  onToggleAll,
  allExpanded,
  onCreateFolder,
  onCreateNote,
  canCreate = true,
  onCreateFromTemplate,
  onImportMarkdown,
  viewOptions,
}: {
  scope: WorkspaceScope;
  label: string;
  detail?: string | null;
  selected: boolean;
  sectionExpanded: boolean;
  dragActive: boolean;
  onSelectTopLevel: () => void;
  onSectionToggle: () => void;
  onToggleAll?: () => void;
  allExpanded?: boolean;
  onCreateFolder: () => void;
  onCreateNote: () => void;
  /** Off where this workspace can't take new notes: the create actions hide. */
  canCreate?: boolean;
  onCreateFromTemplate?: () => void;
  onImportMarkdown?: () => void;
  /** The workspace's View options menu, beside New Folder; given the row controls' tab stop. */
  viewOptions?: (control: { tabIndex?: number }) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_FOLDER_DROP_ID });
  const rowRef = useRef<HTMLDivElement | null>(null);
  const setRowRef = useCallback((node: HTMLDivElement | null) => {
    rowRef.current = node;
    setNodeRef(node);
  }, [setNodeRef]);
  const treeItemProps = useFolderTreeItem(WORKSPACE_ROOT_FOCUS_ID, selected, sectionExpanded, ['toggle']);
  const toggleControlId = useFolderTreeControlId(WORKSPACE_ROOT_FOCUS_ID, 'toggle');

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setRowRef}
          data-folder-tree-row-id={WORKSPACE_ROOT_FOCUS_ID}
          data-folder-tree-kind="root"
          // Sticks to the scroll area's very top. The gap above it is the scroller's margin, not
          // padding (see FolderNavigator), so the scrollbar starts level with this row.
          className="sticky top-0 z-10 min-w-0 bg-background-muted"
        >
          <EntityRow
            selected={selected}
            active={dragActive && isOver}
            variant="compact"
            tone="quiet"
            leadingControls={(
              <button
                type="button"
                id={toggleControlId}
                onClick={(event) => {
                  event.stopPropagation();
                  onSectionToggle();
                }}
                className={cn(
                  '-mx-0.75 -my-2 flex h-10 w-5 shrink-0 items-center justify-center rounded text-icon-subtle group-hover/entity-row:text-icon-default hover:text-text-default',
                  FOCUS_RING_INSET_CLASS,
                )}
                aria-label={sectionExpanded ? `Collapse ${label}` : `Expand ${label}`}
                aria-expanded={sectionExpanded}
                tabIndex={treeItemProps?.tabIndex}
              >
                <span className="group-hover/entity-row:hidden group-focus-within/entity-row:hidden">
                  <WorkspaceRootScopeIcon scope={scope} />
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    'hidden size-3.5 group-hover/entity-row:block group-focus-within/entity-row:block',
                    COLLAPSE_ICON_CLASS,
                    sectionExpanded && 'rotate-90',
                  )}
                />
              </button>
            )}
            title={detail ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{label}</span>
                <span aria-hidden="true" className="truncate text-xs font-normal text-text-subtle">{detail}</span>
              </span>
            ) : label}
            contentAriaLabel={label}
            contentOnClick={() => {
              onSelectTopLevel();
              if (!sectionExpanded) onSectionToggle();
            }}
            contentFocusTarget
            contentButtonProps={treeItemProps}
            menu={(
              <span className="flex items-center">
              {onToggleAll ? <Tooltip content={allExpanded ? 'Collapse all folders' : 'Expand all folders'}>
                <button type="button" aria-label={allExpanded ? 'Collapse all folders' : 'Expand all folders'} data-folder-tree-ignore-keyboard="true" tabIndex={treeItemProps?.tabIndex} className={cn('flex size-7 items-center justify-center rounded text-icon-subtle hover:text-text-default', FOCUS_RING_INSET_CLASS)} onClick={(event) => { event.stopPropagation(); onToggleAll(); }}>
                  {allExpanded ? <ChevronsDownUp aria-hidden="true" className="size-3.5" /> : <ChevronsUpDown aria-hidden="true" className="size-3.5" />}
                </button>
              </Tooltip> : null}
              {viewOptions?.({ tabIndex: treeItemProps?.tabIndex })}
              <Tooltip content="New Folder">
              <button
                type="button"
                className={cn(
                  'flex size-7 items-center justify-center rounded text-icon-subtle hover:text-text-default',
                  FOCUS_RING_INSET_CLASS,
                )}
                aria-label="New Folder"
                data-folder-tree-ignore-keyboard="true"
                // Like other rows' controls: a tab stop only while the root is the tree's current
                // row, or Shift+Tab out of the tree would land here and make the root the tab stop.
                tabIndex={treeItemProps?.tabIndex}
                onClick={(event) => {
                  event.stopPropagation();
                  onCreateFolder();
                }}
              >
                <FolderPlus aria-hidden="true" className="size-3.5" />
              </button>
              </Tooltip>
              {/* Creating lives here, quietly, rather than as a full-width button; ⌘N still works
                  anywhere, and the row's context menu has the other ways to create. */}
              {canCreate ? (
                <Tooltip content={<NewNoteTooltip />}>
                <button
                  type="button"
                  className={cn(
                    'flex size-7 items-center justify-center rounded text-icon-subtle hover:text-text-default',
                    FOCUS_RING_INSET_CLASS,
                  )}
                  aria-label="New Note"
                  data-folder-tree-ignore-keyboard="true"
                  tabIndex={treeItemProps?.tabIndex}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreateNote();
                  }}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                </button>
                </Tooltip>
              ) : null}
              </span>
            )}
            className={cn(TREE_ROW_FOCUS_CLASS, 'workspace-root-row')}
          />
        </div>
      </ContextMenuTrigger>
      {/* The trigger is the row's wrapper, which can't take focus: Escape returns to the row itself,
          as a note row's menu does; a click elsewhere keeps focus there. */}
      <ContextMenuContent
        finalFocus={(closeType) => (closeType === 'keyboard'
          ? rowRef.current?.querySelector<HTMLElement>('[data-folder-tree-primary="true"]') ?? false
          : false)}
      >
        <ContextMenuItem disabled={!canCreate} onSelect={onCreateNote}>
          <FileText aria-hidden="true" className="h-4 w-4" />
          New Note
          <ActionMenuShortcut actionId="new-note" />
        </ContextMenuItem>
        {onCreateFromTemplate ? (
          <ContextMenuItem disabled={!canCreate} onSelect={onCreateFromTemplate}>
            <LayoutTemplate aria-hidden="true" className="h-4 w-4" />
            New Note from Template…
          </ContextMenuItem>
        ) : null}
        {onImportMarkdown ? (
          <ContextMenuItem disabled={!canCreate} onSelect={onImportMarkdown}>
            <Upload aria-hidden="true" className="h-4 w-4" />
            Import Markdown Note…
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canCreate} onSelect={onCreateFolder}>
          <FolderPlus aria-hidden="true" className="h-4 w-4" />
          New Folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The trash's place in the sidebar: a row styled like the tree's, outside it, above the account. */
export function SidebarTrashRow({
  label,
  selected,
  onOpen,
}: {
  label: string;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <div data-testid="sidebar-trash-row" className="min-w-0">
      <EntityRow
        selected={selected}
        leadingControls={(
          <span aria-hidden="true" className="-mx-0.75 -my-2 flex h-10 w-5 shrink-0 items-center justify-center text-icon-subtle group-hover/entity-row:text-icon-default">
            <Trash2 className="h-3.5 w-3.5" />
          </span>
        )}
        title={label}
        variant="compact"
        tone="quiet"
        contentAriaLabel={label}
        contentOnClick={onOpen}
        contentAriaCurrent={selected ? 'page' : undefined}
        className={TREE_ROW_FOCUS_CLASS}
      />
    </div>
  );
}

export function SidebarHistoryRow({ selected, onOpen }: { selected: boolean; onOpen: () => void }) {
  return <div className="min-w-0"><EntityRow selected={selected} leadingControls={<span aria-hidden="true" className="-mx-0.75 -my-2 flex h-10 w-5 shrink-0 items-center justify-center text-icon-subtle"><History className="h-3.5 w-3.5" /></span>} title="History" variant="compact" tone="quiet" contentAriaLabel="History" contentOnClick={onOpen} contentAriaCurrent={selected ? 'page' : undefined} className={TREE_ROW_FOCUS_CLASS} /></div>;
}

/**
 * The blank space below the tree: clicking it selects the top level, and its context menu creates
 * there. Moving something to the top level is a drop on the workspace row instead.
 */
export function TreeBlankArea({
  onSelect,
  onCreateFolder,
  onCreateNote,
}: {
  onSelect: () => void;
  onCreateFolder: () => void;
  onCreateNote: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-testid="tree-top-level"
          onClick={onSelect}
          className="mt-0.5 min-h-10 flex-1"
        />
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
    <div className="flex h-8 min-w-48 items-center gap-2 rounded-md border border-border-default bg-background-default px-2 text-sm text-text-default shadow-lg">
      <FolderGlyph icon={node.icon} color={node.color} open />
      <span className="truncate">{node.name}</span>
    </div>
  );
}

export function NoteDragOverlay({ entry }: { entry: FolderTreeNote | null }) {
  const kind = useNoteKind(entry?.note);
  if (!entry) {
    return null;
  }

  return (
    <div className="flex min-h-9 min-w-56 items-center gap-2 rounded-md border border-border-default bg-background-default px-3 py-2 text-sm text-text-default shadow-lg">
      <NoteKindIcon kind={kind} className="h-4 w-4 text-text-subtle" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{entry.note.title || 'Untitled'}</span>
        <span className="block truncate text-xs text-text-subtle">{entry.folderLabel || entry.note.shortId}</span>
      </span>
    </div>
  );
}

/**
 * A first-tag group over the tree's root notes. It opens like a folder but can't be selected:
 * pressing it toggles its children. Groups start expanded, so collapse stores the exception,
 * not every other group.
 */
export function TagGroupRow({
  tag,
  label,
  expanded,
  count,
  onToggle,
}: {
  /** The group's first tag; '' is the trailing "Untagged" group. */
  tag: string;
  label: string;
  expanded: boolean;
  count: number;
  onToggle: () => void;
}) {
  const groupId = createTagGroupFocusId(tag);
  const treeItemProps = useFolderTreeItem(groupId, false, expanded, ['toggle']);
  const toggleControlId = useFolderTreeControlId(groupId, 'toggle');
  return (
    <div data-folder-tree-row-id={groupId} data-folder-tree-kind="tag-group" className="min-w-0">
      <EntityRow
        variant="compact"
        tone="quiet"
        leadingControls={(
          <button
            type="button"
            id={toggleControlId}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
            aria-expanded={expanded}
            tabIndex={treeItemProps?.tabIndex}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className={cn(
              '-mx-0.75 -my-2 flex h-10 w-5 shrink-0 items-center justify-center rounded text-icon-subtle group-hover/entity-row:text-icon-default hover:text-text-default',
              FOCUS_RING_INSET_CLASS,
            )}
          >
            {/* One slot like a folder's: the tag icon, turning into the arrow on hover or focus,
                so the label lines up with folder names at the same level. */}
            <Tag aria-hidden="true" className="size-3.5 group-hover/entity-row:hidden group-focus-within/entity-row:hidden" />
            <ChevronRight aria-hidden="true" className={cn('hidden size-3.5 group-hover/entity-row:block group-focus-within/entity-row:block', COLLAPSE_ICON_CLASS, expanded && 'rotate-90')} />
          </button>
        )}
        title={label}
        contentOnClick={onToggle}
        contentAriaLabel={`${label} group`}
        contentFocusTarget
        contentButtonProps={treeItemProps}
        trailing={<span className="tabular-nums">{count}</span>}
        className={TREE_ROW_FOCUS_CLASS}
      />
    </div>
  );
}

/**
 * A folder's contents mount the first time it opens, then stay mounted (hidden) when it closes:
 * reopening is a style change rather than rebuilding every row. Folders never opened cost nothing.
 */
function KeepMountedOnceOpen({ open, children }: { open: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened ? <div hidden={!open} className="contents">{children}</div> : null;
}

export { KeepMountedOnceOpen };

export function FolderTreeView({
  nodes,
  notes = [],
  parentFolderId,
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
  isMovingFolder,
  topLevelGuides = false,
}: {
  nodes: FolderTreeNode[];
  notes?: FolderTreeNote[];
  parentFolderId?: string;
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
  isMovingFolder: boolean;
  /** Draws guides on top-level rows too, when they sit under the workspace root. */
  topLevelGuides?: boolean;
}) {
  const groupId = useFolderTreeGroupId(parentFolderId ?? '');
  if (nodes.length === 0 && notes.length === 0) {
    return null;
  }

  const items = nodes.map((node, index) => {
    const lastChild = index === nodes.length - 1 && notes.length === 0;
    const collapsed = collapsedFolderIds.has(node.id);
    const isActiveFolder = activeFolderId === node.id;

    return (
      <li role="presentation" key={node.id} className={treeItemClassName(depth > 0 || topLevelGuides)}>
        {/* Guides run the full height of each child, last one included, so a folder's line covers
            everything it contains. A half-height end would need a horizontal stroke to read. */}
        {depth > 0 || topLevelGuides ? <span aria-hidden="true" data-tree-guide={lastChild ? 'end' : 'continuation'} className={TREE_GUIDE_CLASS} /> : null}
        <div className="relative min-w-0">
        <FolderButton
          node={node}
          // The open note's folder is the selected folder too; only the note row shows it, so one
          // selection never lights up two rows.
          selected={selectedFolderId === node.id && !(selectedNoteId && node.notes.some((entry) => entry.note.id === selectedNoteId))}
          focusTarget={selectedFolderId === node.id && !selectedNoteId}
          collapsed={collapsed}
          active={isActiveFolder}
          noteDropTarget={Boolean(activeNoteId)}
          disabledDrag={isMovingFolder}
          onSelect={onFolderSelect}
          onToggle={onFolderToggle}
          onCreateFolderInside={onCreateFolderInside}
          onCreateNoteInside={onCreateNoteInside}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onRevealInFinder={onFolderRevealInFinder}
        />
        </div>
        <KeepMountedOnceOpen open={!collapsed && !isActiveFolder}><div className="grid overflow-hidden">
          <div className="min-h-0 overflow-hidden">
            <div className="mt-0.5 min-w-0">
              <FolderTreeView
                parentFolderId={node.id}
                nodes={node.children}
                notes={node.notes}
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
                isMovingFolder={isMovingFolder}
              />
            </div>
          </div>
        </div></KeepMountedOnceOpen>
      </li>
    );
  });

  const noteItems = notes.map((entry, index) => (
    <li role="presentation" key={`note:${entry.note.id}`} className={treeItemClassName(depth > 0 || topLevelGuides, true)}>
      {depth > 0 || topLevelGuides ? <span aria-hidden="true" data-tree-guide={index === notes.length - 1 ? 'end' : 'continuation'} className={TREE_GUIDE_CLASS} /> : null}
      <NoteRow
        entry={entry}
        // The open note shows as selected only while its folder is the selection; clicking another
        // folder moves the one highlight there.
        selected={entry.note.id === selectedNoteId && (!selectedFolderId || selectedFolderId === parentFolderId)}
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
    </li>
  ));

  if (depth === 0) {
    return <>{items}{noteItems}</>;
  }

  return (
    <ul role="group" id={parentFolderId ? groupId : undefined} data-tree-children="true" className={cn('relative m-0 grid min-w-0 list-none gap-0.5 p-0', TREE_CHILDREN_INDENT_CLASS)}>
      {items}
      {noteItems}
    </ul>
  );
}

// Title widths for the placeholder rows, uneven like real titles.
const SKELETON_TITLE_WIDTHS = ['w-3/4', 'w-1/2', 'w-4/5', 'w-2/5', 'w-2/3', 'w-3/5', 'w-3/4', 'w-1/2'];
const SKELETON_BAR_CLASS = 'animate-pulse rounded-sm bg-background-hover motion-reduce:animate-none';

/** Placeholder rows shaped like the tree's compact note rows: icon, one-line title, trailing date. */
export function NoteListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading notes" className="grid min-w-0 gap-0.5">
      {SKELETON_TITLE_WIDTHS.map((width, index) => (
        <div key={index} aria-hidden="true" className="flex h-7 min-w-0 items-center gap-2 px-2">
          <div className={cn('size-3.5 shrink-0', SKELETON_BAR_CLASS)} />
          <div className="min-w-0 flex-1">
            <div className={cn('h-2.5', width, SKELETON_BAR_CLASS)} />
          </div>
          <div className={cn('note-row-date h-2 w-8 shrink-0', SKELETON_BAR_CLASS)} />
        </div>
      ))}
    </div>
  );
}

export const NoteRow = memo(NoteRowView, areNoteRowPropsEqual) as typeof NoteRowView;

export { NoteSummaryCard } from './NoteSummaryCard';

// Folder rows re-render only when their data changes (callbacks compare as equal; see NoteRow).
const FolderButton = memo(FolderButtonView, areNoteRowPropsEqual) as typeof FolderButtonView;
