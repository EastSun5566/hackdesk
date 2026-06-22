import { Loader2, Trash2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FolderTreeNode } from '@/lib/hackmd-folders';

export function DeleteFolderDialog({
  folder,
  isDeleting,
  onCancel,
  onDelete,
}: {
  folder: FolderTreeNode | null;
  isDeleting: boolean;
  onCancel: () => void;
  onDelete: (folder: FolderTreeNode) => void;
}) {
  return (
    <Dialog open={!!folder} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Folder</DialogTitle>
          <DialogDescription>
            Delete “{folder?.name}”? This removes the folder from HackMD. This action cannot be undone from HackDesk.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-md border border-border-default px-3 py-2 text-sm hover:bg-element-bg-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => folder && onDelete(folder)}
            disabled={isDeleting || !folder}
            className="inline-flex items-center gap-2 rounded-md bg-destructive-default px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive-hover disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
