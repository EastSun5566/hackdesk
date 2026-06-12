import { FolderPen, Loader2 } from 'lucide-react';
import { FormEvent } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { RenameFolderDialogState } from './types';

export function RenameFolderDialog({
  state,
  isRenaming,
  onStateChange,
  onRename,
}: {
  state: RenameFolderDialogState;
  isRenaming: boolean;
  onStateChange: (state: RenameFolderDialogState) => void;
  onRename: (folderId: string, name: string) => void;
}) {
  const canSubmit = Boolean(state.folderId && state.name.trim()) && !isRenaming;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.folderId && canSubmit) {
      onRename(state.folderId, state.name.trim());
    }
  };

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onStateChange(open ? state : { open: false, folderId: null, name: '' })}
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
              className="h-10 w-full rounded-md border border-border-default bg-background-default px-3 text-sm outline-none transition-colors focus:border-primary-default focus:ring-2 focus:ring-primary-default/20"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onStateChange({ open: false, folderId: null, name: '' })}
              className="rounded-md border border-border-default px-3 py-2 text-sm hover:bg-background-selected"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-md bg-primary-default px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
            >
              {isRenaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPen className="h-4 w-4" />}
              Rename
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
