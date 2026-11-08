import { ActionMenuShortcut } from './ActionShortcutContext';
import {
  FolderPen,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { FolderTreeNode } from '@/lib/hackmd-folders';

import { ToolbarDropdownMoreTrigger } from './interaction-primitives';

export function FolderActionsDropdown({
  selectedFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenPalette,
}: {
  selectedFolder: FolderTreeNode | null;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onOpenPalette: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isLocalFolder = selectedFolder?.id.startsWith('local-folder:') ?? false;
  const runAfterClose = (action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 0);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <ToolbarDropdownMoreTrigger label="Navigator actions" />
      <DropdownMenuContent>
        <DropdownMenuItem disabled={!selectedFolder} onSelect={(event) => {
          event.preventDefault();
          if (selectedFolder) {
            runAfterClose(() => onRenameFolder(selectedFolder.id));
          }
        }}>
          <FolderPen aria-hidden="true" className="h-4 w-4" />
          Edit Selected Folder
          <ActionMenuShortcut actionId="rename-folder" />
        </DropdownMenuItem>
        <DropdownMenuItem destructive disabled={!selectedFolder} onSelect={(event) => {
          event.preventDefault();
          if (selectedFolder) {
            runAfterClose(() => onDeleteFolder(selectedFolder.id));
          }
        }}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {isLocalFolder ? 'Move Selected Folder to Trash' : 'Delete Selected Folder'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(event) => {
          event.preventDefault();
          runAfterClose(onOpenPalette);
        }}>
          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
          Open Command Palette
          <ActionMenuShortcut actionId="open-command-palette" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
