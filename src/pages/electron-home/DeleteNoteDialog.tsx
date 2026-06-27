import { Loader2, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { DocumentSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
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
  const isLocalNote = note?.teamPath === LOCAL_VAULT_TEAM_PATH;

  return (
    <AlertDialog open={!!note} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isLocalNote ? 'Move Note to Trash' : 'Delete Note'}</AlertDialogTitle>
          <AlertDialogDescription>
            {isLocalNote
              ? 'This moves the Markdown file to the system trash.'
              : 'This removes the note from HackMD. This action cannot be undone from HackDesk.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {note ? (
          <div className="space-y-5">
            <div className="rounded-md border border-border-default bg-background-muted px-3 py-2 text-sm">
              <p className="truncate font-medium">{note.title || 'Untitled'}</p>
              <p className="mt-1 text-xs text-text-subtle">{note.teamPath ? `@${note.teamPath}` : 'My Workspace'}</p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={onCancel}
                className={SECONDARY_BUTTON_CLASS}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={() => onDelete(note)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-md border border-destructive-default px-3 text-sm font-medium text-destructive-default transition-colors active:bg-destructive-soft disabled:pointer-events-none disabled:opacity-50',
                  PRESSED_CLASS,
                  FOCUS_RING_CLASS,
                )}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isLocalNote ? 'Move to Trash' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
