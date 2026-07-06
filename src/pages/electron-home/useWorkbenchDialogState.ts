import { useCallback, useState } from 'react';

import type { DocumentSummary } from '@/lib/electron-api';
import type { FolderTreeNode } from '@/lib/hackmd-folders';

import type {
  CommandPaletteState,
  CreateFolderDialogState,
  CreateNoteDialogState,
  RenameFolderDialogState,
} from './types';

export function createClosedFolderDialogState(): CreateFolderDialogState {
  return { open: false, name: '', description: '', icon: '', color: '' };
}

export function createClosedRenameFolderDialogState(): RenameFolderDialogState {
  return { open: false, folderId: null, name: '', description: '', icon: '', color: '' };
}

export type WorkbenchDialogState = {
  createDialog: CreateNoteDialogState;
  createFolderDialog: CreateFolderDialogState;
  deleteFolderTarget: FolderTreeNode | null;
  deleteTarget: DocumentSummary | null;
  palette: CommandPaletteState;
  renameFolderDialog: RenameFolderDialogState;
  settingsOpen: boolean;
  shareOpen: boolean;
  closeTransientLayer: () => boolean;
  setCreateDialog: (state: CreateNoteDialogState) => void;
  setCreateFolderDialog: (state: CreateFolderDialogState) => void;
  setDeleteFolderTarget: (target: FolderTreeNode | null) => void;
  setDeleteTarget: (target: DocumentSummary | null) => void;
  setPalette: (state: CommandPaletteState) => void;
  setRenameFolderDialog: (state: RenameFolderDialogState) => void;
  setSettingsOpen: (open: boolean) => void;
  setShareOpen: (open: boolean) => void;
};

export function useWorkbenchDialogState(): WorkbenchDialogState {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [palette, setPalette] = useState<CommandPaletteState>({ mode: 'commands', open: false, search: '' });
  const [createDialog, setCreateDialog] = useState<CreateNoteDialogState>({ open: false, title: '' });
  const [createFolderDialog, setCreateFolderDialog] = useState<CreateFolderDialogState>(createClosedFolderDialogState);
  const [renameFolderDialog, setRenameFolderDialog] = useState<RenameFolderDialogState>(createClosedRenameFolderDialogState);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderTreeNode | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const closeTransientLayer = useCallback(() => {
    if (palette.open) {
      setPalette({ mode: 'commands', open: false, search: '' });
      return true;
    }

    if (shareOpen) {
      setShareOpen(false);
      return true;
    }

    if (createDialog.open) {
      setCreateDialog({ open: false, title: '' });
      return true;
    }

    if (createFolderDialog.open) {
      setCreateFolderDialog(createClosedFolderDialogState());
      return true;
    }

    if (deleteTarget) {
      setDeleteTarget(null);
      return true;
    }

    if (deleteFolderTarget) {
      setDeleteFolderTarget(null);
      return true;
    }

    if (renameFolderDialog.open) {
      setRenameFolderDialog(createClosedRenameFolderDialogState());
      return true;
    }

    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }

    return false;
  }, [
    createDialog.open,
    createFolderDialog.open,
    deleteFolderTarget,
    deleteTarget,
    palette.open,
    renameFolderDialog.open,
    settingsOpen,
    shareOpen,
  ]);

  return {
    createDialog,
    createFolderDialog,
    deleteFolderTarget,
    deleteTarget,
    palette,
    renameFolderDialog,
    settingsOpen,
    shareOpen,
    closeTransientLayer,
    setCreateDialog,
    setCreateFolderDialog,
    setDeleteFolderTarget,
    setDeleteTarget,
    setPalette,
    setRenameFolderDialog,
    setSettingsOpen,
    setShareOpen,
  };
}
