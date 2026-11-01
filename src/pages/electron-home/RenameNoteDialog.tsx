import { Loader2 } from 'lucide-react';
import { useState } from 'react';

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

const RENAME_NOTE_TITLE_ID = 'rename-note-title';
const RENAME_NOTE_DESCRIPTION_ID = 'rename-note-description';

/**
 * Renames the open note and saves it. A HackMD note sends the new title; a Local Vault note's file
 * takes the new name. The note header no longer holds an editable title, so this is the one place.
 */
export function RenameNoteDialog({
  open,
  title,
  isSaving,
  localVault,
  onOpenChange,
  onRename,
}: {
  open: boolean;
  title: string;
  isSaving: boolean;
  localVault: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (title: string) => void;
}) {
  const [draft, setDraft] = useState(title);
  const [openedWith, setOpenedWith] = useState<string | null>(null);
  // Each opening starts from the note's current title.
  if (open && openedWith !== title) {
    setOpenedWith(title);
    setDraft(title);
  }
  if (!open && openedWith !== null) setOpenedWith(null);
  const normalized = draft.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Note</DialogTitle>
          <DialogDescription id={RENAME_NOTE_DESCRIPTION_ID}>
            {localVault ? 'The file takes the new name when you rename it.' : 'The new title is saved to HackMD.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalized && normalized !== title) onRename(normalized);
            else if (normalized) onOpenChange(false);
          }}
        >
          <Field>
            <FieldLabel htmlFor={RENAME_NOTE_TITLE_ID}>Title</FieldLabel>
            <Input
              id={RENAME_NOTE_TITLE_ID}
              name="renameTitle"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              autoComplete="off"
              spellCheck
              aria-describedby={RENAME_NOTE_DESCRIPTION_ID}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" type="button" disabled={isSaving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!normalized || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Renaming…
                </>
              ) : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
