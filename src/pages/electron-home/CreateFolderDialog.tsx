import { FolderPlus, Loader2 } from 'lucide-react';

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
import type { CreateFolderInput } from '@/lib/electron-api';

import { FolderAppearanceFields } from './FolderAppearanceFields';
import type { CreateFolderDialogState } from './types';

const CLOSED_CREATE_FOLDER_DIALOG_STATE = { open: false, name: '', description: '', icon: '', color: '' } as const;
const CREATE_FOLDER_DIALOG_DESCRIPTION_ID = 'create-folder-dialog-description';
const CREATE_FOLDER_DESCRIPTION_ID = 'create-folder-description';
const CREATE_FOLDER_NAME_ID = 'create-folder-name';
const CREATE_FOLDER_LOCATION_ID = 'create-folder-location';

export function CreateFolderDialog({
  state,
  scopeLabel,
  parentFolderLabel,
  isCreating,
  onStateChange,
  onCreate,
}: {
  state: CreateFolderDialogState;
  scopeLabel: string;
  parentFolderLabel: string | null;
  isCreating: boolean;
  onStateChange: (state: CreateFolderDialogState) => void;
  onCreate: (input: CreateFolderInput) => void;
}) {
  const normalizedName = state.name.trim();
  const normalizedDescription = state.description.trim();
  const normalizedIcon = state.icon.trim();
  const normalizedColor = state.color.trim();
  const location = parentFolderLabel ? `${scopeLabel} / ${parentFolderLabel}` : scopeLabel;

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onStateChange(open ? state : CLOSED_CREATE_FOLDER_DIALOG_STATE)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
          <DialogDescription id={CREATE_FOLDER_DIALOG_DESCRIPTION_ID} className="sr-only">
            Create a folder in the selected workspace or parent folder.
          </DialogDescription>
        </DialogHeader>
        <p
          id={CREATE_FOLDER_LOCATION_ID}
          className="flex min-w-0 items-center gap-2 rounded-md border border-border-default bg-background-muted px-3 py-2 text-xs text-text-subtle"
        >
          <span className="shrink-0 font-medium text-text-default">Location</span>
          <span className="min-w-0 truncate">{location}</span>
        </p>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalizedName) {
              onCreate({
                name: normalizedName,
                ...(normalizedDescription ? { description: normalizedDescription } : {}),
                ...(normalizedIcon ? { icon: normalizedIcon } : {}),
                ...(normalizedColor ? { color: normalizedColor } : {}),
              });
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={CREATE_FOLDER_NAME_ID}>Name</FieldLabel>
            <Input
              id={CREATE_FOLDER_NAME_ID}
              name="name"
              value={state.name}
              onChange={(event) => onStateChange({ ...state, name: event.target.value })}
              placeholder="Projects…"
              autoComplete="off"
              spellCheck
              aria-describedby={`${CREATE_FOLDER_DIALOG_DESCRIPTION_ID} ${CREATE_FOLDER_LOCATION_ID}`}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={CREATE_FOLDER_DESCRIPTION_ID}>Description</FieldLabel>
            <Textarea
              id={CREATE_FOLDER_DESCRIPTION_ID}
              name="description"
              value={state.description}
              onChange={(event) => onStateChange({ ...state, description: event.target.value })}
              rows={3}
              placeholder="Active project notes…"
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
              disabled={isCreating}
              onClick={() => onStateChange(CLOSED_CREATE_FOLDER_DIALOG_STATE)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!normalizedName || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Creating…
                </>
              ) : (
                <>
                  <FolderPlus aria-hidden="true" className="h-4 w-4" />
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
