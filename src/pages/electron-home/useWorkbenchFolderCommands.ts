import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

import type {
  FolderSummary,
} from '@/lib/electron-api';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';
import {
  type FolderTree,
  UNFILED_FOLDER_ID,
} from '@/lib/hackmd-folders';

import { createClosedFolderDialogState, type OverlayControls } from './workbench-overlays';
import type { WorkspaceScope } from './types';

export type WorkbenchFolderCommandsOptions = {
  currentFolders: FolderSummary[];
  folderTree: FolderTree;
  hasToken: boolean;
  hasLocalVault: boolean;
  canStartDraft?: boolean;
  moveFolder: (operation: FolderDropOperation) => void;
  onChooseLocalVault: () => void;
  openDraftNote: () => void;
  /** Opens the Templates picker; absent where templates are not offered. */
  openTemplatePicker?: () => void;
  scopeType: WorkspaceScope['type'];
  setSelectedFolderId: (folderId: string | null) => void;
  overlayControls: OverlayControls;
};

export function useWorkbenchFolderCommands({
  currentFolders,
  folderTree,
  hasToken,
  hasLocalVault,
  canStartDraft = false,
  moveFolder,
  onChooseLocalVault,
  openDraftNote,
  openTemplatePicker,
  scopeType,
  setSelectedFolderId,
  overlayControls,
}: WorkbenchFolderCommandsOptions) {
  /** Whether a note can be created here; otherwise shows the user what to do first. */
  const canCreateNote = useCallback(() => {
    if (scopeType === 'local' && !hasLocalVault) {
      onChooseLocalVault();
      return false;
    }

    if (!hasToken && scopeType !== 'local') {
      overlayControls.openSettings();
      return false;
    }

    if (scopeType === 'history') {
      toast.info('Choose My Workspace or a team before creating a note.');
      return false;
    }

    return true;
  }, [hasLocalVault, hasToken, onChooseLocalVault, scopeType, overlayControls]);

  const handleCreateNote = useCallback(() => {
    if (canStartDraft || canCreateNote()) openDraftNote();
  }, [canStartDraft, canCreateNote, openDraftNote]);

  const handleCreateNoteFromTemplate = useCallback(() => {
    if (canCreateNote()) openTemplatePicker?.();
  }, [canCreateNote, openTemplatePicker]);

  const handleCreateFolder = useCallback(() => {
    if (scopeType === 'local' && !hasLocalVault) {
      onChooseLocalVault();
      return;
    }

    if (!hasToken && scopeType !== 'local') {
      overlayControls.openSettings();
      return;
    }

    if (scopeType === 'history') {
      toast.info('Choose My Workspace or a team before creating a folder.');
      return;
    }

    overlayControls.set('createFolder', { ...createClosedFolderDialogState(), open: true });
  }, [hasLocalVault, hasToken, onChooseLocalVault, scopeType, overlayControls]);

  const handleCreateFolderInside = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId ?? UNFILED_FOLDER_ID);
    handleCreateFolder();
  }, [handleCreateFolder, setSelectedFolderId]);

  const handleCreateNoteInside = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId ?? UNFILED_FOLDER_ID);
    if (canStartDraft) { openDraftNote(); return; }
    if (scopeType === 'local' && !hasLocalVault) {
      onChooseLocalVault();
      return;
    }

    if (!hasToken && scopeType !== 'local') {
      overlayControls.openSettings();
      return;
    }

    if (scopeType === 'history') {
      toast.info('Choose My Workspace or a team before creating a note.');
      return;
    }

    overlayControls.set('createNote', { open: true, title: '' });
  }, [
    canStartDraft,
    openDraftNote,
    hasLocalVault,
    hasToken,
    onChooseLocalVault,
    scopeType,
    overlayControls,
    setSelectedFolderId,
  ]);

  const handleRenameFolder = useCallback((folderId: string) => {
    const folder = folderTree.nodesById.get(folderId);
    if (!folder) {
      toast.info('Select a folder before renaming it.');
      return;
    }

    const folderSummary = currentFolders.find((candidate) => candidate.id === folderId);
    overlayControls.set('renameFolder', {
      open: true,
      folderId,
      name: folder.name,
      description: folderSummary?.description ?? '',
      icon: folder.icon ?? '',
      color: folder.color ?? '',
    });
  }, [currentFolders, folderTree.nodesById, overlayControls]);

  const handleDeleteFolderRequest = useCallback((folderId: string) => {
    const folder = folderTree.nodesById.get(folderId);
    if (!folder) {
      toast.info('Select a folder before deleting it.');
      return;
    }

    // The in-app delete dialog asks, so the question matches the app rather than the system.
    overlayControls.set('deleteFolder', folder);

  }, [folderTree.nodesById, overlayControls]);

  const handleFolderDrop = useCallback((operation: FolderDropOperation) => {
    moveFolder(operation);
  }, [moveFolder]);

  return {
    handleCreateFolder,
    handleCreateFolderInside,
    handleCreateNote,
    handleCreateNoteFromTemplate,
    handleCreateNoteInside,
    handleDeleteFolderRequest,
    handleFolderDrop,
    handleRenameFolder,
  };
}
