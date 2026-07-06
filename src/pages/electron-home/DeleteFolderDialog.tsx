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
  const isLocalFolder = folder?.id.startsWith('local-folder:') ?? false;

  return (
    <AlertDialog open={!!folder} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isLocalFolder ? 'Move Folder to Trash' : 'Delete Folder'}</AlertDialogTitle>
          <AlertDialogDescription>
            {isLocalFolder
              ? `Move “${folder?.name}” to the system trash? Local Markdown files inside the folder move with it.`
              : `Delete “${folder?.name}”? This deletes the folder from HackMD. Local vault files are not affected. This cannot be undone from HackDesk.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
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
            {isDeleting
              ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              : <Trash2 aria-hidden="true" className="h-4 w-4" />}
            {isLocalFolder ? 'Move to Trash' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
