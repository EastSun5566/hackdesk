import { Loader2, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { CreateNoteDialogState } from './types';
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_INPUT_CLASS } from './ui';

const CLOSED_CREATE_NOTE_DIALOG_STATE = { open: false, title: '' } as const;
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
          <DialogDescription id={CREATE_NOTE_LOCATION_ID}>Create a note in {location}.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalizedTitle) {
              onCreate(normalizedTitle);
            }
          }}
        >
          <div className="space-y-2 text-sm">
            <label htmlFor={CREATE_NOTE_TITLE_ID} className="font-medium">Title</label>
            <input
              id={CREATE_NOTE_TITLE_ID}
              name="title"
              value={state.title}
              onChange={(event) => onStateChange({ ...state, title: event.target.value })}
              className={TEXT_INPUT_CLASS}
              placeholder="Sprint notes…"
              autoComplete="off"
              spellCheck
              aria-describedby={CREATE_NOTE_LOCATION_ID}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => onStateChange(CLOSED_CREATE_NOTE_DIALOG_STATE)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!normalizedTitle || isCreating}
              className={PRIMARY_BUTTON_CLASS}
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
