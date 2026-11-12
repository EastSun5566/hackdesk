import { act, renderHook } from '@testing-library/react';
import { toast } from '@/components/ui/toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FolderSummary } from '@/lib/electron-api';
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
    folderTree: buildHackmdFolderTree([], folders),
    hasLocalVault: false,
    hasToken: true,
    moveFolder: vi.fn(),
    onChooseLocalVault: vi.fn(),
    openDraftNote: vi.fn(),
    scopeType: 'personal',
    setSelectedFolderId: vi.fn(),
    overlays: { set: vi.fn(), close: vi.fn(), openSettings: vi.fn() },
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

    expect(options.overlays.openSettings).toHaveBeenCalledTimes(2);
    expect(options.overlays.openSettings).toHaveBeenCalled();
    expect(options.overlays.set).not.toHaveBeenCalledWith('createNote', expect.anything());
    expect(options.overlays.set).not.toHaveBeenCalledWith('createFolder', expect.anything());
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
    expect(options.overlays.set).not.toHaveBeenCalledWith('createNote', expect.anything());
    expect(options.overlays.set).not.toHaveBeenCalledWith('createFolder', expect.anything());
  });

  it('opens the template picker only where a note can be created', () => {
    const openTemplatePicker = vi.fn();
    const allowed = renderHook(() => useWorkbenchFolderCommands(createOptions({ openTemplatePicker })));
    act(() => allowed.result.current.handleCreateNoteFromTemplate());
    expect(openTemplatePicker).toHaveBeenCalledOnce();

    const options = createOptions({ openTemplatePicker, hasToken: false });
    const blocked = renderHook(() => useWorkbenchFolderCommands(options));
    act(() => blocked.result.current.handleCreateNoteFromTemplate());
    expect(openTemplatePicker).toHaveBeenCalledOnce();
    expect(options.overlays.openSettings).toHaveBeenCalled();
  });

  it('selects the target folder before opening create-inside-folder', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleCreateFolderInside('folder-a');
    });

    expect(options.setSelectedFolderId).toHaveBeenCalledWith('folder-a');
    expect(options.overlays.set).toHaveBeenCalledWith('createFolder', {
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
    expect(options.overlays.set).toHaveBeenCalledWith('createNote', { open: true, title: '' });
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

    expect(missingTokenOptions.overlays.openSettings).toHaveBeenCalled();
    expect(missingTokenOptions.overlays.set).not.toHaveBeenCalledWith('createNote', expect.anything());

    const historyOptions = createOptions({ scopeType: 'history' });
    const history = renderHook(() => useWorkbenchFolderCommands(historyOptions));

    act(() => {
      history.result.current.handleCreateNoteInside('folder-a');
    });

    expect(toast.info).toHaveBeenCalledWith('Choose My Workspace or a team before creating a note.');
    expect(historyOptions.overlays.set).not.toHaveBeenCalledWith('createNote', expect.anything());
  });

  it('opens the local vault picker before creating local notes or folders when no vault is configured', () => {
    const options = createOptions({ hasLocalVault: false, hasToken: false, scopeType: 'local' });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleCreateNote();
      result.current.handleCreateFolder();
    });

    expect(options.onChooseLocalVault).toHaveBeenCalledTimes(2);
    expect(options.overlays.set).not.toHaveBeenCalledWith('createNote', expect.anything());
    expect(options.overlays.set).not.toHaveBeenCalledWith('createFolder', expect.anything());
    expect(options.overlays.openSettings).not.toHaveBeenCalled();
  });

  it('allows local create commands after a vault is configured', () => {
    const options = createOptions({ hasLocalVault: true, hasToken: false, scopeType: 'local' });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleCreateNote();
      result.current.handleCreateFolder();
    });

    expect(options.openDraftNote).toHaveBeenCalledOnce();
    expect(options.overlays.set).not.toHaveBeenCalledWith('createNote', expect.anything());
    expect(options.overlays.set).toHaveBeenCalledWith('createFolder', {
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

    expect(options.overlays.set).toHaveBeenCalledWith('renameFolder', {
      open: true,
      folderId: 'folder-a',
      name: 'Project',
      description: 'Launch notes',
      icon: '1f525',
      color: '#ff5500',
    });
  });

  it('opens the delete folder dialog before deleting a HackMD folder', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleDeleteFolderRequest('folder-a');
    });

    expect(options.overlays.set).toHaveBeenCalledWith('deleteFolder', expect.objectContaining({
      id: 'folder-a',
      name: 'Folder A',
    }));
  });

  it('opens the delete folder dialog for a local folder', () => {
    const options = createOptions({ scopeType: 'local' });
    const { result } = renderHook(() => useWorkbenchFolderCommands(options));

    act(() => {
      result.current.handleDeleteFolderRequest('folder-a');
    });

    expect(options.overlays.set).toHaveBeenCalledWith('deleteFolder', expect.objectContaining({
      id: 'folder-a',
      name: 'Folder A',
    }));
  });
});
