import { Loader2, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input } from '@/components/ui/field';

import type { CreateNoteDialogState } from './types';

const CLOSED_CREATE_NOTE_DIALOG_STATE = { open: false, title: '' } as const;
const CREATE_NOTE_DESCRIPTION_ID = 'create-note-description';
const CREATE_NOTE_TITLE_ID = 'create-note-title';
const CREATE_NOTE_LOCATION_ID = 'create-note-location';

export function CreateNoteDialog({
  state,
  scopeLabel,
  folderLabel,
  isCreating,
  onStateChange,
  onCreate,
}: {
  state: CreateNoteDialogState;
  scopeLabel: string;
  folderLabel: string | null;
  isCreating: boolean;
  onStateChange: (state: CreateNoteDialogState) => void;
  onCreate: (title: string) => void;
}) {
  const normalizedTitle = state.title.trim();
  const location = folderLabel ? `${scopeLabel} / ${folderLabel}` : scopeLabel;

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onStateChange(open ? state : CLOSED_CREATE_NOTE_DIALOG_STATE)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Note</DialogTitle>
          <DialogDescription id={CREATE_NOTE_DESCRIPTION_ID} className="sr-only">
            Create a note in the selected workspace or folder.
          </DialogDescription>
        </DialogHeader>
        <p
          id={CREATE_NOTE_LOCATION_ID}
          className="flex min-w-0 items-center gap-2 rounded-md border border-border-default bg-background-muted px-3 py-2 text-xs text-text-subtle"
        >
          <span className="shrink-0 font-medium text-text-default">Location</span>
          <span className="min-w-0 truncate">{location}</span>
        </p>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalizedTitle) {
              onCreate(normalizedTitle);
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={CREATE_NOTE_TITLE_ID}>Title</FieldLabel>
            <Input
              id={CREATE_NOTE_TITLE_ID}
              name="title"
              value={state.title}
              onChange={(event) => onStateChange({ ...state, title: event.target.value })}
              placeholder="Sprint notes…"
              autoComplete="off"
              spellCheck
              aria-describedby={`${CREATE_NOTE_DESCRIPTION_ID} ${CREATE_NOTE_LOCATION_ID}`}
            />
          </Field>
          <DialogFooter>
            <Button
              variant="secondary"
              type="button"
              disabled={isCreating}
              onClick={() => onStateChange(CLOSED_CREATE_NOTE_DIALOG_STATE)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!normalizedTitle || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
