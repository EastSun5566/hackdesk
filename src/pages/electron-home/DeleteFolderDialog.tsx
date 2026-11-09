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
              ? `Move “${folder?.name}” and everything inside to the system trash?`
              : `Delete “${folder?.name}” from HackMD? You cannot undo this in HackDesk. Local files stay unchanged.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
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
