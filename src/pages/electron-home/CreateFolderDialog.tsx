import { FolderPlus, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CreateFolderInput } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { FolderAppearanceFields } from './FolderAppearanceFields';
import type { CreateFolderDialogState } from './types';
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_INPUT_CLASS } from './ui';

const CLOSED_CREATE_FOLDER_DIALOG_STATE = { open: false, name: '', description: '', icon: '', color: '' } as const;
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
          <DialogDescription id={CREATE_FOLDER_LOCATION_ID}>Create a folder in {location}.</DialogDescription>
        </DialogHeader>
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
          <div className="space-y-2 text-sm">
            <label htmlFor={CREATE_FOLDER_NAME_ID} className="font-medium">Name</label>
            <input
              id={CREATE_FOLDER_NAME_ID}
              name="name"
              value={state.name}
              onChange={(event) => onStateChange({ ...state, name: event.target.value })}
              className={TEXT_INPUT_CLASS}
              placeholder="Projects…"
              autoComplete="off"
              spellCheck
              aria-describedby={CREATE_FOLDER_LOCATION_ID}
            />
          </div>
          <div className="space-y-2 text-sm">
            <label htmlFor={CREATE_FOLDER_DESCRIPTION_ID} className="font-medium">Description</label>
            <textarea
              id={CREATE_FOLDER_DESCRIPTION_ID}
              name="description"
              value={state.description}
              onChange={(event) => onStateChange({ ...state, description: event.target.value })}
              className={cn(TEXT_INPUT_CLASS, 'min-h-20 py-2')}
              rows={3}
              placeholder="Active project notes…"
              spellCheck
            />
          </div>
          <FolderAppearanceFields
            icon={state.icon}
            color={state.color}
            onIconChange={(icon) => onStateChange({ ...state, icon })}
            onColorChange={(color) => onStateChange({ ...state, color })}
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => onStateChange(CLOSED_CREATE_FOLDER_DIALOG_STATE)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!normalizedName || isCreating}
              className={PRIMARY_BUTTON_CLASS}
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              Create
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
