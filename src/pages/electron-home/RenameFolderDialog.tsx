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
  const normalizedColor = state.color.trim();

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
      onOpenChange={(open) => onStateChange(open ? state : closedState)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Folder</DialogTitle>
          <DialogDescription>Update the folder name in HackMD.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-text-default">Name</span>
            <input
              autoFocus
              value={state.name}
              onChange={(event) => onStateChange({ ...state, name: event.target.value })}
              className={TEXT_INPUT_CLASS}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-text-default">Description</span>
            <textarea
              value={state.description}
              onChange={(event) => onStateChange({ ...state, description: event.target.value })}
              className={`${TEXT_INPUT_CLASS} min-h-20 py-2`}
              rows={3}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-text-default">Icon codepoint</span>
              <input
                value={state.icon}
                onChange={(event) => onStateChange({ ...state, icon: event.target.value })}
                className={TEXT_INPUT_CLASS}
                placeholder="1F4C1"
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-text-default">Color</span>
              <span className="flex items-center gap-2">
                <span
                  className="h-5 w-5 rounded-[4px] border border-border-default"
                  style={{ backgroundColor: normalizedColor || 'transparent' }}
                  aria-hidden="true"
                />
                <input
                  value={state.color}
                  onChange={(event) => onStateChange({ ...state, color: event.target.value })}
                  className={TEXT_INPUT_CLASS}
                  placeholder="#2F80ED"
                />
              </span>
            </label>
          </div>
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
              Rename
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
