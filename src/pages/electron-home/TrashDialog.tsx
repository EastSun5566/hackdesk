import { useId, useMemo, useState, type ReactNode } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import {
  getHackDeskAPI,
  type NoteSummary,
  type RestoreTrashFailureReason,
  type TrashedNoteSummary,
} from '@/lib/electron-api';

import { formatDate } from './ui';
import { getRestoredIds, getTrashErrorMessage, useRestoreNotes, useTrashList } from './useTrash';

const FAILURE_MESSAGES: Record<RestoreTrashFailureReason, string> = {
  NOT_FOUND: 'Already removed or restored.',
  PERMISSION_DENIED: 'You can’t restore this note.',
  INTERNAL_ERROR: 'HackMD couldn’t restore it. Try again.',
  UNKNOWN: 'HackMD didn’t restore it. Try again.',
};

function getTitle(note: Pick<TrashedNoteSummary, 'title'>) {
  return note.title.trim() || 'Untitled';
}

function getRestoreLabel(count: number) {
  if (count === 0) return 'Restore Notes';
  return `Restore ${count} ${count === 1 ? 'Note' : 'Notes'}`;
}

function StatusMessage({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div role="status" aria-busy={busy || undefined} className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-sm text-text-subtle">
      {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </div>
  );
}

type TrashDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens a restored note in the editor. */
  onOpenNote: (note: NoteSummary) => void;
};

export function TrashDialog({ open, onOpenChange, onOpenNote }: TrashDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="scroll-edges gap-0 overflow-hidden p-0">
        {/* The popup unmounts when closed, so each opening starts with nothing selected. */}
        <TrashBody onClose={() => onOpenChange(false)} onOpenNote={onOpenNote} />
      </DialogContent>
    </Dialog>
  );
}

function TrashRow({
  note,
  selected,
  failure,
  busy,
  onSelectedChange,
  onRestore,
}: {
  note: TrashedNoteSummary;
  selected: boolean;
  failure: RestoreTrashFailureReason | undefined;
  busy: boolean;
  onSelectedChange: (selected: boolean) => void;
  onRestore: () => void;
}) {
  const title = getTitle(note);
  const failureId = useId();

  return (
    <li className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-element-bg-hover">
      <Checkbox
        aria-label={`Select ${title}`}
        aria-describedby={failure ? failureId : undefined}
        checked={selected}
        onCheckedChange={(checked) => onSelectedChange(checked)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-default">{title}</p>
        <p className="truncate text-xs text-text-subtle">
          Deleted {formatDate(note.deletedAtMillis)}
          {note.permanentDeleteAtMillis ? ` · Kept until ${formatDate(note.permanentDeleteAtMillis)}` : ''}
        </p>
        {failure ? <p id={failureId} className="text-xs text-destructive-default">{FAILURE_MESSAGES[failure]}</p> : null}
      </div>
      <Tooltip content="Restore">
        <Button variant="ghost" size="icon-sm" aria-label={`Restore ${title}`} disabled={busy} onClick={onRestore}>
          <RotateCcw aria-hidden="true" className="size-4" />
        </Button>
      </Tooltip>
    </li>
  );
}

function TrashBody({ onClose, onOpenNote }: { onClose: () => void; onOpenNote: (note: NoteSummary) => void }) {
  const selectAllId = useId();
  const list = useTrashList(true);
  const restore = useRestoreNotes();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<Record<string, RestoreTrashFailureReason>>({});
  const notes = useMemo(() => list.data ?? [], [list.data]);
  // Restored notes leave the list, so they drop out of the selection too.
  const selectedIds = notes.filter((note) => selected.has(note.id)).map((note) => note.id);
  const allSelected = notes.length > 0 && selectedIds.length === notes.length;

  const setRowSelected = (noteId: string, value: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (value) next.add(noteId);
      else next.delete(noteId);
      return next;
    });
  };

  const openRestoredNote = async (noteId: string) => {
    try {
      const value = await getHackDeskAPI()?.hackmd.getNote(noteId, null);
      if (!value?.data) throw new Error(value?.source === 'error' ? value.error : 'Could not open the note.');
      onOpenNote(value.data);
      onClose();
    } catch (error) {
      toast.error(getTrashErrorMessage(error));
    }
  };

  const restoreIds = (noteIds: string[]) => {
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
  };

  let content: ReactNode;
  if (list.isPending) {
    content = <StatusMessage busy>Loading trash…</StatusMessage>;
  } else if (list.isError) {
    content = (
      <StatusMessage>
        <span>Could not load the trash. {getTrashErrorMessage(list.error)}</span>
        <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>Retry</Button>
      </StatusMessage>
    );
  } else if (notes.length === 0) {
    content = <StatusMessage>Your trash is empty.</StatusMessage>;
  } else {
    content = (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="scroll-edge-top relative flex shrink-0 items-center justify-between gap-3 px-4 py-2 text-sm">
          <label className="flex items-center gap-3 text-text-default">
            <Checkbox
              aria-labelledby={selectAllId}
              checked={allSelected}
              indeterminate={selectedIds.length > 0 && !allSelected}
              onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(notes.map((note) => note.id)))}
            />
            <span id={selectAllId}>Select all</span>
          </label>
          {selectedIds.length > 0 ? <span className="text-xs text-text-subtle">{selectedIds.length} selected</span> : null}
        </div>
        <ul aria-label="Deleted notes" className="scroll-edges-source min-h-0 flex-1 list-none space-y-0.5 overflow-y-auto px-1.5 pb-1.5">
          {notes.map((note) => (
            <TrashRow
              key={note.id}
              note={note}
              selected={selected.has(note.id)}
              failure={failures[note.id]}
              busy={restore.isPending}
              onSelectedChange={(value) => setRowSelected(note.id, value)}
              onRestore={() => restoreIds([note.id])}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <div className="shrink-0 py-4 pl-5 pr-14">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 aria-hidden="true" className="size-4" />
            Trash
          </DialogTitle>
          <DialogDescription>Notes you deleted from My Workspace. Team notes are not listed here.</DialogDescription>
        </DialogHeader>
      </div>
      {content}
      <DialogFooter className="scroll-edge-bottom relative shrink-0 gap-2 px-5 py-3">
        <Button variant="primary" disabled={selectedIds.length === 0 || restore.isPending} onClick={() => restoreIds(selectedIds)}>
          {restore.isPending
            ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            : <RotateCcw aria-hidden="true" className="size-4" />}
          {getRestoreLabel(selectedIds.length)}
        </Button>
      </DialogFooter>
    </>
  );
}
