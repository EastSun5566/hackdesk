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
import type { UpdateFolderInput } from '@/lib/electron-api';

import { FolderAppearanceFields } from './FolderAppearanceFields';
import type { RenameFolderDialogState } from './types';
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_INPUT_CLASS } from './ui';

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
  const closedState = { open: false, folderId: null, name: '', description: '', icon: '', color: '' };

  const releasePointerLockAfterClose = () => {
    window.setTimeout(() => {
      if (!document.querySelector('[role="dialog"]')) {
        document.body.style.pointerEvents = '';
      }
    }, 0);
  };

  const handleOpenChange = (open: boolean) => {
    onStateChange(open ? state : closedState);
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
          <DialogDescription>Update the folder name, description, icon, and color in HackMD.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-text-default">Name</span>
            <input
              name="name"
              autoFocus
              value={state.name}
              onChange={(event) => onStateChange({ ...state, name: event.target.value })}
              className={TEXT_INPUT_CLASS}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-text-default">Description</span>
            <textarea
              name="description"
              value={state.description}
              onChange={(event) => onStateChange({ ...state, description: event.target.value })}
              className={`${TEXT_INPUT_CLASS} min-h-20 py-2`}
              rows={3}
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
              disabled={!canSubmit}
              className={PRIMARY_BUTTON_CLASS}
            >
              {isRenaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPen className="h-4 w-4" />}
              Save Changes
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
