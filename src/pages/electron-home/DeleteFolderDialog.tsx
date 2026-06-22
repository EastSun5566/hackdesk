import { Loader2, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { FolderTreeNode } from '@/lib/hackmd-folders';
import { cn } from '@/lib/utils';

import { FOCUS_RING_CLASS, PRESSED_CLASS, SECONDARY_BUTTON_CLASS } from './ui';

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
    <AlertDialog open={!!folder} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Folder</AlertDialogTitle>
          <AlertDialogDescription>
            Delete “{folder?.name}”? This removes the folder from HackMD. This action cannot be undone from HackDesk.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onCancel}
            disabled={isDeleting}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => folder && onDelete(folder)}
            disabled={isDeleting || !folder}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-md bg-destructive-default px-3 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive-hover disabled:pointer-events-none disabled:opacity-50',
              PRESSED_CLASS,
              FOCUS_RING_CLASS,
            )}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
