import { Loader2, Trash2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DocumentSummary } from '@/lib/electron-api';

import { FOCUS_RING_CLASS, PRESSED_CLASS, SECONDARY_BUTTON_CLASS } from './ui';

export function DeleteNoteDialog({
  note,
  isDeleting,
  onCancel,
  onDelete,
}: {
  note: DocumentSummary | null;
  isDeleting: boolean;
  onCancel: () => void;
  onDelete: (note: DocumentSummary) => void;
}) {
  return (
    <Dialog open={!!note} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Note</DialogTitle>
          <DialogDescription>
            This removes the note from HackMD. This action cannot be undone from HackDesk.
          </DialogDescription>
        </DialogHeader>
        {note ? (
          <div className="space-y-5">
            <div className="rounded-md border border-border-default bg-background-muted px-3 py-2 text-sm">
              <p className="truncate font-medium">{note.title || 'Untitled'}</p>
              <p className="mt-1 text-xs text-text-subtle">{note.teamPath ? `@${note.teamPath}` : 'My Workspace'}</p>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={onCancel}
                className={SECONDARY_BUTTON_CLASS}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => onDelete(note)}
                className={`inline-flex h-9 items-center gap-2 rounded-md border border-destructive-default px-3 text-sm font-medium text-destructive-default transition-colors active:bg-destructive-soft ${PRESSED_CLASS} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
