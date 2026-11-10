import { useCallback } from 'react';
import { confirmDialog } from '@/components/ConfirmDialogHost';
import type { QueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui/toast';
import type { ElectronSafeSettings } from '@/lib/electron-api';
import type { LocalVaultSessionApi } from './useLocalVaultSession';
import { getActiveLocalVaultPath, getActiveLocalWorkspace } from '@/lib/settings';
import type { LocalWorkspaceMutationResult } from '@/lib/local-vault';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import type { WorkspaceScope } from './types';
import { localVaultFolderName } from './workspace-root-labels';
import { getLocalVaultSnapshotQueryKey } from './useElectronLocalVault';

function vaultLabel(settings: ElectronSafeSettings | undefined, vaultId: string) {
  const vault = settings?.localVault.vaults.find((candidate) => candidate.id === vaultId);
  return vault ? vault.path.split(/[\\/]/).filter(Boolean).at(-1) ?? vault.path : null;
}

/** The scope label: the workspace's name when the folder belongs to the open working set. */
function localScopeLabel(settings: ElectronSafeSettings | undefined, vaultId?: string | null) {
  const workspace = getActiveLocalWorkspace(settings);
  if (workspace && (!vaultId || workspace.vaultIds.includes(vaultId))) {
    return workspace.name;
  }
  const activePath = getActiveLocalVaultPath(settings);
  return activePath ? localVaultFolderName(activePath) : 'Local Vault';
}

export type HomeLocalVaultActions = {
  chooseLocalVault: () => Promise<boolean>;
  switchLocalVault: (vaultId: string) => Promise<void>;
  openStandaloneLocalVault: (vaultId: string) => Promise<void>;
  forgetLocalVault: (vaultId?: string) => Promise<void>;
  /** Creates a named working set and opens it. */
  createLocalWorkspace: (name: string, vaultIds: string[]) => Promise<void>;
  renameLocalWorkspace: (id: string, name: string) => Promise<void>;
  deleteLocalWorkspace: (id: string) => Promise<void>;
  /** Opens a named working set, or returns to the single-folder view with null. */
  activateLocalWorkspace: (id: string | null) => Promise<void>;
  setLocalWorkspaceFolders: (id: string, vaultIds: string[]) => Promise<void>;
  /** Changes only the order of a set's folders; the open folder and its tabs stay as they are. */
  reorderLocalWorkspaceFolders: (id: string, vaultIds: string[]) => Promise<void>;
  openLocalVault: () => Promise<void>;
  refreshLocalVault: () => Promise<void>;
  revealLocalFolder: (folderId: string) => void;
  revealLocalNote: (note: { id: string; teamPath: string | null }) => void;
};

export function useHomeLocalVaultActions({
  api,
  queryClient,
  refetchLocalVault,
  scopeType,
  setWorkspaceScope,
}: {
  api: LocalVaultSessionApi | undefined;
  queryClient: QueryClient;
  refetchLocalVault: () => Promise<unknown>;
  /** The scope on screen, so edits to a set never pull the user out of another workspace. */
  scopeType?: WorkspaceScope['type'];
  setWorkspaceScope: (scope: WorkspaceScope) => void;
}): HomeLocalVaultActions {
  const chooseLocalVault = useCallback(async () => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    const result = await api.localVault.choose();
    if (result.canceled) {
      return false;
    }

    if (result.settings) {
      queryClient.setQueryData(['electron', 'settings'], result.settings);
    }
    if (result.snapshot) {
      queryClient.setQueryData(getLocalVaultSnapshotQueryKey(getActiveLocalVaultPath(result.settings)), result.snapshot);
    }
    setWorkspaceScope({ type: 'local', label: localScopeLabel(result.settings, result.snapshot?.vaultId), vaultId: result.snapshot?.vaultId });
    return true;
  }, [api, queryClient, setWorkspaceScope]);

  const switchLocalVault = useCallback(async (vaultId: string) => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    // Another folder of the open set is a focus change: the set keeps its tabs and scope.
    const settings = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
    const workspace = getActiveLocalWorkspace(settings);
    if ((scopeType === undefined || scopeType === 'local') && workspace
      && settings?.localVault.activeVaultId && workspace.vaultIds.includes(settings.localVault.activeVaultId)
      && workspace.vaultIds.includes(vaultId)) {
      if (vaultId !== settings.localVault.activeVaultId) await api.localVault.focusVault(vaultId);
      return;
    }
    const result = await api.localVault.switchVault(vaultId);
    setWorkspaceScope({ type: 'local', label: localScopeLabel(result.settings, result.snapshot?.vaultId), vaultId: result.snapshot?.vaultId });
  }, [api, queryClient, scopeType, setWorkspaceScope]);

  const openStandaloneLocalVault = useCallback(async (vaultId: string) => {
    if (!api) throw new Error('Electron API is unavailable.');
    const result = await api.localVault.openStandaloneVault(vaultId);
    setWorkspaceScope({ type: 'local', label: localScopeLabel(result.settings, result.snapshot?.vaultId), vaultId: result.snapshot?.vaultId });
  }, [api, setWorkspaceScope]);

  const openLocalVault = useCallback(async () => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    await api.localVault.revealRoot();
  }, [api]);

  const revealLocalNote = useCallback((note: { id: string; teamPath: string | null }) => {
    if (!api || note.teamPath !== LOCAL_VAULT_TEAM_PATH) {
      return;
    }

    void api.localVault.revealNote({ noteId: note.id }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to reveal local note.');
    });
  }, [api]);

  const revealLocalFolder = useCallback((folderId: string) => {
    const prefix = 'local-folder:';
    if (!api || !folderId.startsWith(prefix)) {
      return;
    }

    void api.localVault.revealFolder({ relativePath: folderId.slice(prefix.length) }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to reveal local folder.');
    });
  }, [api]);

  const forgetLocalVault = useCallback(async (vaultId?: string) => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    const targetLabel = vaultId
      ? vaultLabel(queryClient.getQueryData(['electron', 'settings']), vaultId)
      : null;
    const { confirmed } = await confirmDialog({
      title: 'Forget Local Vault',
      message: targetLabel ? `Forget “${targetLabel}”?` : 'Forget this local vault?',
      detail: 'HackDesk will stop opening this folder automatically. Your Markdown files will not be deleted.',
      confirmLabel: 'Forget Vault',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    if (vaultId) {
      const before = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
      const wasActive = (before ? getActiveLocalVaultPath(before) : null) !== null
        && before?.localVault.activeVaultId === vaultId;
      const result = await api.localVault.forgetVault(vaultId);
      // A forgotten active vault leaves the scope pointing at a vault that no
      // longer exists; move it onto the fallback so tabs and folders reload.
      if (wasActive) {
        setWorkspaceScope({
          type: 'local',
          label: localScopeLabel(result.settings, result.snapshot?.vaultId),
          vaultId: result.snapshot?.vaultId,
        });
      }
    } else {
      const before = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
      const nextSettings = await api.localVault.disconnect();
      queryClient.setQueryData(['electron', 'settings'], nextSettings);
      queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), null);
      if (before?.localVault.activeVaultId) {
        setWorkspaceScope({
          type: 'local',
          label: localScopeLabel(nextSettings, nextSettings.localVault.activeVaultId),
          vaultId: nextSettings.localVault.activeVaultId ?? undefined,
        });
      }
    }
    toast.success('Local vault forgotten.', { description: 'Markdown files were not deleted.' });
  }, [api, queryClient]);

  const refreshLocalVault = useCallback(async () => {
    await refetchLocalVault();
  }, [refetchLocalVault]);

  const applyWorkspaceMutation = useCallback(async (
    mutation: Parameters<LocalVaultSessionApi['localVault']['updateWorkspace']>[0],
    options: { opensWorkspace?: boolean } = {},
  ): Promise<LocalWorkspaceMutationResult> => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }
    const result = await api.localVault.updateWorkspace(mutation);
    // Creating or opening a set shows it; renaming or re-scoping one leaves a user who is
    // reading another workspace where they are.
    const shown = options.opensWorkspace || scopeType === undefined || scopeType === 'local';
    if (shown) {
      const nextVaultId = result.snapshot?.vaultId ?? null;
      setWorkspaceScope({
        type: 'local',
        label: localScopeLabel(result.settings, nextVaultId),
        vaultId: nextVaultId ?? undefined,
      });
    }
    return result;
  }, [api, scopeType, setWorkspaceScope]);

  const createLocalWorkspaceAction = useCallback(async (name: string, vaultIds: string[]) => {
    // The main process opens the new set as it creates it.
    await applyWorkspaceMutation({ type: 'create', name, vaultIds }, { opensWorkspace: true });
  }, [applyWorkspaceMutation]);

  const renameLocalWorkspaceAction = useCallback(async (id: string, name: string) => {
    await applyWorkspaceMutation({ type: 'rename', id, name });
  }, [applyWorkspaceMutation]);

  const deleteLocalWorkspaceAction = useCallback(async (id: string) => {
    await applyWorkspaceMutation({ type: 'delete', id });
    if (scopeType !== undefined && scopeType !== 'local') {
      return;
    }
    // The deleted set's name no longer applies to the root.
    const settings = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
    const activePath = getActiveLocalVaultPath(settings);
    setWorkspaceScope({
      type: 'local',
      label: activePath ? localVaultFolderName(activePath) : 'Local Vault',
      vaultId: settings?.localVault.activeVaultId ?? undefined,
    });
  }, [applyWorkspaceMutation, queryClient, scopeType, setWorkspaceScope]);

  const activateLocalWorkspaceAction = useCallback(async (id: string | null) => {
    await applyWorkspaceMutation({ type: 'activate', id }, { opensWorkspace: true });
  }, [applyWorkspaceMutation]);

  const setLocalWorkspaceFoldersAction = useCallback(async (id: string, vaultIds: string[]) => {
    await applyWorkspaceMutation({ type: 'setVaults', id, vaultIds });
  }, [applyWorkspaceMutation]);

  const reorderLocalWorkspaceFolders = useCallback(async (id: string, vaultIds: string[]) => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }
    await api.localVault.reorderWorkspace(id, vaultIds);
  }, [api]);

  return {
    chooseLocalVault,
    reorderLocalWorkspaceFolders,
    switchLocalVault,
    openStandaloneLocalVault,
    createLocalWorkspace: createLocalWorkspaceAction,
    renameLocalWorkspace: renameLocalWorkspaceAction,
    deleteLocalWorkspace: deleteLocalWorkspaceAction,
    activateLocalWorkspace: activateLocalWorkspaceAction,
    setLocalWorkspaceFolders: setLocalWorkspaceFoldersAction,
    forgetLocalVault,
    openLocalVault,
    refreshLocalVault,
    revealLocalFolder,
    revealLocalNote,
  };
}
