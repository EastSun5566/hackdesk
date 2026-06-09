import { FolderPlus, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  onCreate: (name: string) => void;
}) {
  const normalizedName = state.name.trim();
  const location = parentFolderLabel ? `${scopeLabel} / ${parentFolderLabel}` : scopeLabel;

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onStateChange(open ? state : { open: false, name: '' })}
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
              onCreate(normalizedName);
            }
          }}
        >
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Name</span>
            <input
              autoFocus
              value={state.name}
              onChange={(event) => onStateChange({ ...state, name: event.target.value })}
              className={TEXT_INPUT_CLASS}
              placeholder="Projects"
            />
          </label>
          <DialogFooter>
            <button
              type="button"
              onClick={() => onStateChange({ open: false, name: '' })}
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
