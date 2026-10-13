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
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => folder && onDelete(folder)}
            disabled={isDeleting || !folder}
            variant="destructive-solid"
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
