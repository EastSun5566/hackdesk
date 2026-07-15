import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from '@/components/ui/toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FolderSummary, HackDeskElectronAPI } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import type { WorkbenchFolderCommandsOptions } from './useWorkbenchFolderCommands';
import { useWorkbenchFolderCommands } from './useWorkbenchFolderCommands';

vi.mock('@/components/ui/toast', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function folder(overrides: Partial<FolderSummary> = {}): FolderSummary {
  return {
    id: 'folder-a',
    name: 'Folder A',
    icon: null,
    color: null,
    parentId: null,
    clientId: null,
    description: null,
    createdAtMillis: null,
    updatedAtMillis: null,
    ...overrides,
  };
}

function createOptions(overrides: Partial<WorkbenchFolderCommandsOptions> = {}): WorkbenchFolderCommandsOptions {
  const folders = [folder()];

  return {
    currentFolders: folders,
    deleteFolder: vi.fn(),
    folderTree: buildHackmdFolderTree([], folders),
    hasLocalVault: false,
    hasToken: true,
    moveFolder: vi.fn(),
    onChooseLocalVault: vi.fn(),
    openDraftNote: vi.fn(),
    scopeType: 'personal',
    setCreateDialog: vi.fn(),
    setCreateFolderDialog: vi.fn(),
    setDeleteFolderTarget: vi.fn(),
    setRenameFolderDialog: vi.fn(),
    setSelectedFolderId: vi.fn(),
    setSettingsOpen: vi.fn(),
    ...overrides,
  };
}

describe('useWorkbenchFolderCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens settings instead of create dialogs when HackMD token is missing', () => {
    const options = createOptions({ hasToken: false });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleCreateNote();
      result.current.handleCreateFolder();
    });

    expect(options.setSettingsOpen).toHaveBeenCalledTimes(2);
    expect(options.setSettingsOpen).toHaveBeenCalledWith(true);
    expect(options.setCreateDialog).not.toHaveBeenCalled();
    expect(options.setCreateFolderDialog).not.toHaveBeenCalled();
  });

  it('shows the existing history-scope toast copy for create commands', () => {
    const options = createOptions({ scopeType: 'history' });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleCreateNote();
      result.current.handleCreateFolder();
    });

    expect(toast.info).toHaveBeenCalledWith('Choose My Workspace or a team before creating a note.');
    expect(toast.info).toHaveBeenCalledWith('Choose My Workspace or a team before creating a folder.');
    expect(options.setCreateDialog).not.toHaveBeenCalled();
    expect(options.setCreateFolderDialog).not.toHaveBeenCalled();
  });

  it('selects the target folder before opening create-inside-folder', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleCreateFolderInside('folder-a');
    });

    expect(options.setSelectedFolderId).toHaveBeenCalledWith('folder-a');
    expect(options.setCreateFolderDialog).toHaveBeenCalledWith({
      open: true,
      name: '',
      description: '',
      icon: '',
      color: '',
    });

    act(() => {
      result.current.handleCreateFolderInside(null);
    });

    expect(options.setSelectedFolderId).toHaveBeenCalledWith(UNFILED_FOLDER_ID);
  });

  it('selects the target folder before opening create-note-inside-folder', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleCreateNoteInside('folder-a');
    });

    expect(options.setSelectedFolderId).toHaveBeenCalledWith('folder-a');
    expect(options.setCreateDialog).toHaveBeenCalledWith({ open: true, title: '' });
    expect(options.openDraftNote).not.toHaveBeenCalled();

    act(() => {
      result.current.handleCreateNoteInside(null);
    });

    expect(options.setSelectedFolderId).toHaveBeenCalledWith(UNFILED_FOLDER_ID);
  });

  it('keeps create-note-inside behind token and workspace gating', () => {
    const missingTokenOptions = createOptions({ hasToken: false });
    const missingToken = renderHook(() => useWorkbenchFolderCommands(missingTokenOptions));

    act(() => {
      missingToken.result.current.handleCreateNoteInside('folder-a');
    });

    expect(missingTokenOptions.setSettingsOpen).toHaveBeenCalledWith(true);
    expect(missingTokenOptions.setCreateDialog).not.toHaveBeenCalled();

    const historyOptions = createOptions({ scopeType: 'history' });
    const history = renderHook(() => useWorkbenchFolderCommands(historyOptions));

    act(() => {
      history.result.current.handleCreateNoteInside('folder-a');
    });

    expect(toast.info).toHaveBeenCalledWith('Choose My Workspace or a team before creating a note.');
    expect(historyOptions.setCreateDialog).not.toHaveBeenCalled();
  });

  it('opens the local vault picker before creating local notes or folders when no vault is configured', () => {
    const options = createOptions({ hasLocalVault: false, hasToken: false, scopeType: 'local' });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleCreateNote();
      result.current.handleCreateFolder();
    });

    expect(options.onChooseLocalVault).toHaveBeenCalledTimes(2);
    expect(options.setCreateDialog).not.toHaveBeenCalled();
    expect(options.setCreateFolderDialog).not.toHaveBeenCalled();
    expect(options.setSettingsOpen).not.toHaveBeenCalled();
  });

  it('allows local create commands after a vault is configured', () => {
    const options = createOptions({ hasLocalVault: true, hasToken: false, scopeType: 'local' });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleCreateNote();
      result.current.handleCreateFolder();
    });

    expect(options.openDraftNote).toHaveBeenCalledOnce();
    expect(options.setCreateDialog).not.toHaveBeenCalled();
    expect(options.setCreateFolderDialog).toHaveBeenCalledWith({
      open: true,
      name: '',
      description: '',
      icon: '',
      color: '',
    });
    expect(options.onChooseLocalVault).not.toHaveBeenCalled();
  });

  it('seeds folder rename metadata from tree and folder summaries', () => {
    const folders = [
      folder({
        name: 'Project',
        icon: '1f525',
        color: '#ff5500',
        description: 'Launch notes',
      }),
    ];
    const options = createOptions({
      currentFolders: folders,
      folderTree: buildHackmdFolderTree([], folders),
    });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleRenameFolder('folder-a');
    });

    expect(options.setRenameFolderDialog).toHaveBeenCalledWith({
      open: true,
      folderId: 'folder-a',
      name: 'Project',
      description: 'Launch notes',
      icon: '1f525',
      color: '#ff5500',
    });
  });

  it('uses native confirmation before deleting a folder when available', async () => {
    const confirm = vi.fn().mockResolvedValue({ confirmed: true });
    const options = createOptions({
      api: { app: { confirm } } as unknown as HackDeskElectronAPI,
    });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleDeleteFolderRequest('folder-a');
    });

    expect(confirm).toHaveBeenCalledWith({
      title: 'Delete Folder',
      message: 'Delete “Folder A”?',
      detail: 'This deletes the folder from HackMD. Local vault files are not affected. This cannot be undone from HackDesk.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    });

    await waitFor(() => {
      expect(options.deleteFolder).toHaveBeenCalledWith({ folderId: 'folder-a', parentFolderId: null });
    });
    expect(options.setDeleteFolderTarget).not.toHaveBeenCalled();
  });

  it('falls back to the delete folder dialog when native confirmation is unavailable', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleDeleteFolderRequest('folder-a');
    });

    expect(options.setDeleteFolderTarget).toHaveBeenCalledWith(expect.objectContaining({
      id: 'folder-a',
      name: 'Folder A',
    }));
    expect(options.deleteFolder).not.toHaveBeenCalled();
  });

  it('uses system trash copy for native local folder confirmation', async () => {
    const confirm = vi.fn().mockResolvedValue({ confirmed: false });
    const options = createOptions({
      api: { app: { confirm } } as unknown as HackDeskElectronAPI,
      scopeType: 'local',
    });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleDeleteFolderRequest('folder-a');
    });

    expect(confirm).toHaveBeenCalledWith({
      title: 'Move Folder to Trash',
      message: 'Move “Folder A”?',
      detail: 'This moves the local folder to the system trash. Local Markdown files inside the folder move with it.',
      confirmLabel: 'Move to Trash',
      cancelLabel: 'Cancel',
      destructive: true,
    });

    await waitFor(() => {
      expect(options.deleteFolder).not.toHaveBeenCalled();
    });
  });
});
