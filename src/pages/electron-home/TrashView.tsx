import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  FileText,
  Loader2,
  RotateCcw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';
import {
  getHackDeskAPI,
  type NoteSummary,
  type RestoreTrashFailureReason,
  type TrashedNoteSummary,
} from '@/lib/electron-api';
import { EmptyState, EntityRow } from './interaction-primitives';
import { formatCompactDate, formatDate, ICON_BUTTON_CLASS } from './ui';
import {
  HACKMD_TEAM_TRASH_FORBIDDEN_MESSAGE,
  isTeamTrashForbiddenError,
} from '@/lib/note-errors';

import type { WorkspaceScope } from './types';
import { getRestoredIds, getTrashErrorMessage, trashTeamPathForScope, useRestoreNotes, useTrashList } from './useTrash';

const FAILURE_MESSAGES: Record<RestoreTrashFailureReason, string> = {
  NOT_FOUND: 'Already removed or restored.',
  PERMISSION_DENIED: 'You can’t restore this note.',
  INTERNAL_ERROR: 'HackMD couldn’t restore it. Try again.',
  UNKNOWN: 'HackMD didn’t restore it. Try again.',
};

export type TrashNavigatorViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenNote: (note: NoteSummary) => void;
  scope: WorkspaceScope;
};

const TREE_ROW_FOCUS_CLASS = 'focus-within:bg-background-primary-subtler focus-within:text-text-emphasize focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus-ring/80';

function getTitle(note: Pick<TrashedNoteSummary, 'title'>) {
  return note.title.trim() || 'Untitled';
}

function StatusMessage({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div role="status" aria-busy={busy || undefined} className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-sm text-text-subtle">
      {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </div>
  );
}

export function TrashNavigatorHeader({
  count,
  onBack,
}: {
  count: number | undefined;
  onBack: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 px-2 pb-1 pt-0.5">
      <Tooltip content="Back to notes">
        <Button variant="ghost" size="icon" aria-label="Back to notes" onClick={onBack}>
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
      </Tooltip>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-default">Trash</span>
      {count === undefined ? null : (
        <span className="shrink-0 text-xs tabular-nums text-text-subtle">{count}</span>
      )}
    </div>
  );
}

function TrashRow({
  note,
  index,
  selected,
  failure,
  busy,
  onPointerSelect,
  onRestore,
}: {
  note: TrashedNoteSummary;
  index: number;
  selected: boolean;
  failure: RestoreTrashFailureReason | undefined;
  busy: boolean;
  onPointerSelect: (index: number, event: ReactMouseEvent) => void;
  onRestore: () => void;
}) {
  const title = getTitle(note);
  const failureId = useId();

  // One line like the tree: the title, with the deleted date as quiet trailing meta. A failed
  // restore adds a second line saying why.
  const subtitle = failure
    ? <span id={failureId} className="text-destructive-default">{FAILURE_MESSAGES[failure]}</span>
    : undefined;

  const entity = (
    <EntityRow
      selected={selected}
      icon={<FileText aria-hidden="true" className="h-3.5 w-3.5" />}
      title={title}
      subtitle={subtitle}
      trailing={(
        <time title={`Deleted ${formatDate(note.deletedAtMillis)}`} dateTime={note.deletedAtMillis ? new Date(note.deletedAtMillis).toISOString() : undefined}>
          {formatCompactDate(note.deletedAtMillis)}
        </time>
      )}
      // Always shown, unlike the tree's edited date: here the date is what tells notes apart.
      trailingClassName="max-w-20 truncate text-right"
      variant="compact"
      tone="quiet"
      selectedIndicator
      contentAriaLabel={title}
      contentButtonProps={failure ? { 'aria-describedby': failureId } : undefined}
      contentOnClick={((event: ReactMouseEvent<HTMLButtonElement>) => onPointerSelect(index, event)) as () => void}
      menu={(
        <Tooltip content="Restore">
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            aria-label={`Restore ${title}`}
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onRestore();
            }}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
          </button>
        </Tooltip>
      )}
      className={TREE_ROW_FOCUS_CLASS}
    />
  );

  const row = note.permanentDeleteAtMillis ? (
    <TooltipRoot>
      <TooltipTrigger delay={300} render={<div className="min-w-0" data-trash-row-index={index} />}>
        {entity}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        Deleted {formatDate(note.deletedAtMillis)} · Kept until {formatDate(note.permanentDeleteAtMillis)}
      </TooltipContent>
    </TooltipRoot>
  ) : (
    <div className="min-w-0" data-trash-row-index={index}>{entity}</div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li role="listitem" className="min-w-0">
          {row}
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onRestore()}>
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Restore
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TrashSelectionBar({
  count,
  busy,
  onClear,
  onRestore,
}: {
  count: number;
  busy: boolean;
  onClear: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="scroll-edge-bottom sticky bottom-0 z-10 flex shrink-0 items-center gap-2 border-t border-border-subtle bg-background-muted px-3 py-1.5 text-xs text-text-subtle">
      <span className="tabular-nums">{count} selected</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="font-medium text-text-default hover:text-text-emphasize"
        disabled={busy}
        onClick={onRestore}
      >
        Restore
      </button>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="font-medium text-text-default hover:text-text-emphasize"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  );
}

export function TrashNavigatorList({
  open,
  onOpenChange,
  onOpenNote,
  scope,
}: TrashNavigatorViewProps) {
  const teamPath = trashTeamPathForScope(scope);
  const list = useTrashList(open && teamPath !== undefined, teamPath ?? null);
  const restore = useRestoreNotes(scope);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<Record<string, RestoreTrashFailureReason>>({});
  const anchorIndexRef = useRef<number | null>(null);
  const notes = useMemo(() => list.data ?? [], [list.data]);
  const selectedIds = useMemo(
    () => notes.filter((note) => selected.has(note.id)).map((note) => note.id),
    [notes, selected],
  );

  const leaveTrash = useCallback(() => {
    onOpenChange(false);
    setSelected(new Set());
    setFailures({});
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setFailures({});
      anchorIndexRef.current = null;
    }
  }, [open]);

  const handleRowSelect = useCallback((index: number, event: ReactMouseEvent) => {
    const noteId = notes[index]?.id;
    if (!noteId) return;
    const primary = event.metaKey || event.ctrlKey;
    if (event.shiftKey && anchorIndexRef.current !== null) {
      const anchor = anchorIndexRef.current;
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      setSelected((current) => {
        const next = new Set(current);
        for (let candidate = start; candidate <= end; candidate += 1) {
          const id = notes[candidate]?.id;
          if (id) next.add(id);
        }
        return next;
      });
      return;
    }
    if (primary) {
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(noteId)) next.delete(noteId);
        else next.add(noteId);
        return next;
      });
      anchorIndexRef.current = index;
      return;
    }
    setSelected(new Set([noteId]));
    anchorIndexRef.current = index;
  }, [notes]);

  const openRestoredNote = useCallback(async (noteId: string) => {
    try {
      const value = await getHackDeskAPI()?.hackmd.getNote(noteId, null);
      if (!value?.data) throw new Error(value?.source === 'error' ? value.error : 'Could not open the note.');
      onOpenNote(value.data);
      leaveTrash();
    } catch (error) {
      toast.error(getTrashErrorMessage(error));
    }
  }, [leaveTrash, onOpenNote]);

  const restoreIds = useCallback((noteIds: string[]) => {
    if (noteIds.length === 0 || restore.isPending) return;
    const titles = new Map(notes.map((note) => [note.id, getTitle(note)]));
    restore.mutate(noteIds, {
      onSuccess: (result) => {
        const restored = getRestoredIds(result);
        setFailures((current) => {
          const next = { ...current };
          for (const noteId of noteIds) {
            const outcome = result[noteId];
            if (outcome?.status === 'failure') next[noteId] = outcome.reason;
            else delete next[noteId];
          }
          return next;
        });
        setSelected((current) => {
          const next = new Set(current);
          for (const noteId of noteIds) {
            if (restored.includes(noteId)) next.delete(noteId);
          }
          return next;
        });

        if (noteIds.length === 1) {
          const [noteId] = noteIds;
          const title = titles.get(noteId) ?? 'Untitled';
          if (restored.length === 1) {
            toast.success(`Restored “${title}”.`, { action: { label: 'Open', onClick: () => void openRestoredNote(noteId) } });
          } else {
            toast.error(`Could not restore “${title}”.`);
          }
          return;
        }

        if (restored.length === noteIds.length) toast.success(`Restored ${restored.length} notes.`);
        else if (restored.length === 0) toast.error('Could not restore the selected notes.');
        else toast.info(`Restored ${restored.length} of ${noteIds.length} notes.`);
      },
      onError: (error) => toast.error(getTrashErrorMessage(error)),
    });
  }, [notes, openRestoredNote, restore]);

  if (!open) return null;

  if (!getHackDeskAPI()) {
    return (
      <EmptyState
        icon={<AlertCircle aria-hidden="true" className="h-7 w-7" />}
        title="Not connected"
        description="The trash needs the HackDesk desktop app."
      />
    );
  }

  if (list.isPending) {
    return <StatusMessage busy>Loading trash…</StatusMessage>;
  }

  if (list.isError) {
    const message = getTrashErrorMessage(list.error);
    if (isTeamTrashForbiddenError(message)) {
      return <StatusMessage>{HACKMD_TEAM_TRASH_FORBIDDEN_MESSAGE}</StatusMessage>;
    }
    return (
      <StatusMessage>
        <span>Could not load the trash. {message}</span>
        <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>Retry</Button>
      </StatusMessage>
    );
  }

  if (notes.length === 0) {
    return <StatusMessage>Trash is empty</StatusMessage>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul aria-label="Deleted notes" className="m-0 grid min-w-0 flex-1 list-none gap-0.5 overflow-y-auto p-0">
        {notes.map((note, index) => (
          <TrashRow
            key={note.id}
            note={note}
            index={index}
            selected={selected.has(note.id)}
            failure={failures[note.id]}
            busy={restore.isPending}
            onPointerSelect={handleRowSelect}
            onRestore={() => restoreIds([note.id])}
          />
        ))}
      </ul>
      {selectedIds.length >= 2 ? (
        <TrashSelectionBar
          count={selectedIds.length}
          busy={restore.isPending}
          onClear={() => setSelected(new Set())}
          onRestore={() => restoreIds(selectedIds)}
        />
      ) : null}
    </div>
  );
}
