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

import { FolderAppearanceFields } from './FolderAppearanceFields';
import type { CreateFolderDialogState } from './types';
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_INPUT_CLASS } from './ui';

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
  const closedState = { open: false, name: '', description: '', icon: '', color: '' };

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onStateChange(open ? state : closedState)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
          <DialogDescription>Create a folder in {location}.</DialogDescription>
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
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Name</span>
            <input
              name="name"
              autoFocus
              value={state.name}
              onChange={(event) => onStateChange({ ...state, name: event.target.value })}
              className={TEXT_INPUT_CLASS}
              placeholder="Projects"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Description</span>
            <textarea
              name="description"
              value={state.description}
              onChange={(event) => onStateChange({ ...state, description: event.target.value })}
              className={`${TEXT_INPUT_CLASS} min-h-20 py-2`}
              rows={3}
              placeholder="Active project notes"
            />
          </label>
          <FolderAppearanceFields
            icon={state.icon}
            color={state.color}
            onIconChange={(icon) => onStateChange({ ...state, icon })}
            onColorChange={(color) => onStateChange({ ...state, color })}
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => onStateChange(closedState)}
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
