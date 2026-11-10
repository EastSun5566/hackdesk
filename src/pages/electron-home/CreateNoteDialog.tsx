import { ChevronDown, Loader2, Plus } from 'lucide-react';

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
  onChooseLocation,
}: {
  state: CreateNoteDialogState;
  scopeLabel: string;
  folderLabel: string | null;
  isCreating: boolean;
  onStateChange: (state: CreateNoteDialogState) => void;
  onCreate: (title: string) => void;
  onChooseLocation?: () => void;
}) {
  const normalizedTitle = state.title.trim();
  const location = folderLabel ? `${scopeLabel} / ${folderLabel}` : scopeLabel;

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onStateChange(open ? state : CLOSED_CREATE_NOTE_DIALOG_STATE)}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>New Note</DialogTitle>
          <DialogDescription id={CREATE_NOTE_DESCRIPTION_ID} className="sr-only">
            Create a note in the selected workspace or folder.
          </DialogDescription>
        </DialogHeader>
        <button
          type="button"
          id={CREATE_NOTE_LOCATION_ID}
          onClick={onChooseLocation}
          disabled={!onChooseLocation || isCreating}
          aria-label={`Change location, current: ${location}`}
          className="flex min-w-0 items-center gap-2 rounded border border-border-default bg-background-muted px-2.5 py-2 text-left text-xs text-text-subtle hover:bg-background-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <span className="shrink-0 font-medium text-text-default">Location</span>
          <span className="min-w-0 flex-1 truncate">{location}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
        </button>
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
