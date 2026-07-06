import { FolderPen, Loader2 } from 'lucide-react';
import { FormEvent } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input, Textarea } from '@/components/ui/field';
import type { UpdateFolderInput } from '@/lib/electron-api';

import { FolderAppearanceFields } from './FolderAppearanceFields';
import type { RenameFolderDialogState } from './types';

const CLOSED_RENAME_FOLDER_DIALOG_STATE = { open: false, folderId: null, name: '', description: '', icon: '', color: '' } as const;
const EDIT_FOLDER_DESCRIPTION_ID = 'edit-folder-description';
const EDIT_FOLDER_FORM_DESCRIPTION_ID = 'edit-folder-form-description';
const EDIT_FOLDER_NAME_ID = 'edit-folder-name';

function releasePointerLockAfterClose() {
  window.setTimeout(() => {
    if (!document.querySelector('[role="dialog"]')) {
      document.body.style.pointerEvents = '';
    }
  }, 0);
}

export function RenameFolderDialog({
  state,
  isRenaming,
  onStateChange,
  onRename,
}: {
  state: RenameFolderDialogState;
  isRenaming: boolean;
  onStateChange: (state: RenameFolderDialogState) => void;
  onRename: (folderId: string, input: UpdateFolderInput) => void;
}) {
  const canSubmit = Boolean(state.folderId && state.name.trim()) && !isRenaming;

  const handleOpenChange = (open: boolean) => {
    onStateChange(open ? state : CLOSED_RENAME_FOLDER_DIALOG_STATE);
    if (!open) {
      releasePointerLockAfterClose();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.folderId && canSubmit) {
      onRename(state.folderId, {
        name: state.name.trim(),
        description: state.description.trim() || null,
        icon: state.icon.trim() || null,
        color: state.color.trim() || null,
      });
    }
  };

  return (
    <Dialog
      open={state.open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Folder</DialogTitle>
          <DialogDescription id={EDIT_FOLDER_FORM_DESCRIPTION_ID} className="sr-only">
            Update the folder name, description, icon, and color.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md border border-border-default bg-background-muted px-3 py-2 text-xs text-text-subtle">
          Update folder details and appearance.
        </p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor={EDIT_FOLDER_NAME_ID}>Name</FieldLabel>
            <Input
              id={EDIT_FOLDER_NAME_ID}
              name="name"
              value={state.name}
              onChange={(event) => onStateChange({ ...state, name: event.target.value })}
              autoComplete="off"
              spellCheck
              aria-describedby={EDIT_FOLDER_FORM_DESCRIPTION_ID}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={EDIT_FOLDER_DESCRIPTION_ID}>Description</FieldLabel>
            <Textarea
              id={EDIT_FOLDER_DESCRIPTION_ID}
              name="description"
              value={state.description}
              onChange={(event) => onStateChange({ ...state, description: event.target.value })}
              rows={3}
              spellCheck
            />
          </Field>
          <FolderAppearanceFields
            icon={state.icon}
            color={state.color}
            onIconChange={(icon) => onStateChange({ ...state, icon })}
            onColorChange={(color) => onStateChange({ ...state, color })}
          />
          <DialogFooter>
            <Button
              variant="secondary"
              type="button"
              disabled={isRenaming}
              onClick={() => onStateChange(CLOSED_RENAME_FOLDER_DIALOG_STATE)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!canSubmit}
            >
              {isRenaming ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Saving…
                </>
              ) : (
                <>
                  <FolderPen aria-hidden="true" className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
