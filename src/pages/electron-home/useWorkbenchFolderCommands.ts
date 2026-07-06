import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

import type {
  FolderSummary,
  HackDeskElectronAPI,
} from '@/lib/electron-api';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';
import {
  type FolderTree,
  type FolderTreeNode,
  UNFILED_FOLDER_ID,
} from '@/lib/hackmd-folders';

import {
  createClosedFolderDialogState,
} from './useWorkbenchDialogState';
import type {
  CreateFolderDialogState,
  CreateNoteDialogState,
  RenameFolderDialogState,
  WorkspaceScope,
} from './types';

export type WorkbenchFolderCommandsOptions = {
  api?: HackDeskElectronAPI;
  currentFolders: FolderSummary[];
  deleteFolder: (input: { folderId: string; parentFolderId: string | null }) => void;
  folderTree: FolderTree;
  hasToken: boolean;
  hasLocalVault: boolean;
  moveFolder: (operation: FolderDropOperation) => void;
  onChooseLocalVault: () => void;
  scopeType: WorkspaceScope['type'];
  setCreateDialog: (state: CreateNoteDialogState) => void;
  setCreateFolderDialog: (state: CreateFolderDialogState) => void;
  setDeleteFolderTarget: (folder: FolderTreeNode | null) => void;
  setRenameFolderDialog: (state: RenameFolderDialogState) => void;
  setSelectedFolderId: (folderId: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
};

export function useWorkbenchFolderCommands({
  api,
  currentFolders,
  deleteFolder,
  folderTree,
  hasToken,
  hasLocalVault,
  moveFolder,
  onChooseLocalVault,
  scopeType,
  setCreateDialog,
  setCreateFolderDialog,
  setDeleteFolderTarget,
  setRenameFolderDialog,
  setSelectedFolderId,
  setSettingsOpen,
}: WorkbenchFolderCommandsOptions) {
  const handleCreateNote = useCallback(() => {
    if (scopeType === 'local' && !hasLocalVault) {
      onChooseLocalVault();
      return;
    }

    if (!hasToken && scopeType !== 'local') {
      setSettingsOpen(true);
      return;
    }

    if (scopeType === 'history') {
      toast.info('Choose My Workspace or a team before creating a note.');
      return;
    }

    setCreateDialog({ open: true, title: '' });
  }, [hasLocalVault, hasToken, onChooseLocalVault, scopeType, setCreateDialog, setSettingsOpen]);

  const handleCreateFolder = useCallback(() => {
    if (scopeType === 'local' && !hasLocalVault) {
      onChooseLocalVault();
      return;
    }

    if (!hasToken && scopeType !== 'local') {
      setSettingsOpen(true);
      return;
    }

    if (scopeType === 'history') {
      toast.info('Choose My Workspace or a team before creating a folder.');
      return;
    }

    setCreateFolderDialog({ ...createClosedFolderDialogState(), open: true });
  }, [hasLocalVault, hasToken, onChooseLocalVault, scopeType, setCreateFolderDialog, setSettingsOpen]);

  const handleCreateFolderInside = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId ?? UNFILED_FOLDER_ID);
    handleCreateFolder();
  }, [handleCreateFolder, setSelectedFolderId]);

  const handleCreateNoteInside = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId ?? UNFILED_FOLDER_ID);
    handleCreateNote();
  }, [handleCreateNote, setSelectedFolderId]);

  const handleRenameFolder = useCallback((folderId: string) => {
    const folder = folderTree.nodesById.get(folderId);
    if (!folder) {
      toast.info('Select a folder before renaming it.');
      return;
    }

    const folderSummary = currentFolders.find((candidate) => candidate.id === folderId);
    setRenameFolderDialog({
      open: true,
      folderId,
      name: folder.name,
      description: folderSummary?.description ?? '',
      icon: folder.icon ?? '',
      color: folder.color ?? '',
    });
  }, [currentFolders, folderTree.nodesById, setRenameFolderDialog]);

  const handleDeleteFolderRequest = useCallback((folderId: string) => {
    const folder = folderTree.nodesById.get(folderId);
    if (!folder) {
      toast.info('Select a folder before deleting it.');
      return;
    }

    if (!api?.app.confirm) {
      setDeleteFolderTarget(folder);
      return;
    }

    const isLocalFolder = scopeType === 'local';
    api.app.confirm({
      title: isLocalFolder ? 'Move Folder to Trash' : 'Delete Folder',
      message: `${isLocalFolder ? 'Move' : 'Delete'} “${folder.name}”?`,
      detail: isLocalFolder
        ? 'This moves the local folder to the system trash. Local Markdown files inside the folder move with it.'
        : 'This deletes the folder from HackMD. Local vault files are not affected. This cannot be undone from HackDesk.',
      confirmLabel: isLocalFolder ? 'Move to Trash' : 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    }).then(({ confirmed }) => {
      if (confirmed) {
        deleteFolder({ folderId: folder.id, parentFolderId: folder.parentId });
      }
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm folder deletion.');
    });
  }, [api, deleteFolder, folderTree.nodesById, scopeType, setDeleteFolderTarget]);

  const handleFolderDrop = useCallback((operation: FolderDropOperation) => {
    moveFolder(operation);
  }, [moveFolder]);

  return {
    handleCreateFolder,
    handleCreateFolderInside,
    handleCreateNote,
    handleCreateNoteInside,
    handleDeleteFolderRequest,
    handleFolderDrop,
    handleRenameFolder,
  };
}
