import { useCallback } from 'react';
import { confirmDialog } from '@/components/ConfirmDialogHost';
import type { QueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui/toast';
import type { ElectronSafeSettings } from '@/lib/electron-api';
import type { LocalVaultSessionApi } from './useLocalVaultSession';
import { getActiveLocalVaultPath } from '@/lib/settings';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import type { WorkspaceScope } from './types';
import { localVaultFolderName } from './workspace-root-labels';
import { getLocalVaultSnapshotQueryKey } from './useElectronLocalVault';

function vaultLabel(settings: ElectronSafeSettings | undefined, vaultId: string) {
  const vault = settings?.localVault.vaults.find((candidate) => candidate.id === vaultId);
  return vault ? vault.path.split(/[\\/]/).filter(Boolean).at(-1) ?? vault.path : null;
}

export type HomeLocalVaultActions = {
  chooseLocalVault: () => Promise<boolean>;
  switchLocalVault: (vaultId: string) => Promise<void>;
  forgetLocalVault: (vaultId?: string) => Promise<void>;
  openLocalVault: () => Promise<void>;
  refreshLocalVault: () => Promise<void>;
  revealLocalFolder: (folderId: string) => void;
  revealLocalNote: (note: { id: string; teamPath: string | null }) => void;
};

export function useHomeLocalVaultActions({
  api,
  queryClient,
  refetchLocalVault,
  setWorkspaceScope,
}: {
  api: LocalVaultSessionApi | undefined;
  queryClient: QueryClient;
  refetchLocalVault: () => Promise<unknown>;
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
    const activePath = result.settings ? getActiveLocalVaultPath(result.settings) : result.snapshot?.rootPath;
    setWorkspaceScope({ type: 'local', label: activePath ? localVaultFolderName(activePath) : 'Local Vault', vaultId: result.snapshot?.vaultId });
    return true;
  }, [api, queryClient, setWorkspaceScope]);

  const switchLocalVault = useCallback(async (vaultId: string) => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    const result = await api.localVault.switchVault(vaultId);
    const activePath = getActiveLocalVaultPath(result.settings);
    setWorkspaceScope({ type: 'local', label: activePath ? localVaultFolderName(activePath) : 'Local Vault', vaultId: result.snapshot?.vaultId });
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
      const activePath = getActiveLocalVaultPath(result.settings);
      // A forgotten active vault leaves the scope pointing at a vault that no
      // longer exists; move it onto the fallback so tabs and folders reload.
      if (wasActive) {
        setWorkspaceScope({
          type: 'local',
          label: activePath ? localVaultFolderName(activePath) : 'Local Vault',
          vaultId: result.snapshot?.vaultId,
        });
      }
    } else {
      const before = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
      const nextSettings = await api.localVault.disconnect();
      queryClient.setQueryData(['electron', 'settings'], nextSettings);
      queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), null);
      if (before?.localVault.activeVaultId) {
        const activePath = getActiveLocalVaultPath(nextSettings);
        setWorkspaceScope({
          type: 'local',
          label: activePath ? localVaultFolderName(activePath) : 'Local Vault',
          vaultId: nextSettings.localVault.activeVaultId ?? undefined,
        });
      }
    }
    toast.success('Local vault forgotten.', { description: 'Markdown files were not deleted.' });
  }, [api, queryClient]);

  const refreshLocalVault = useCallback(async () => {
    await refetchLocalVault();
  }, [refetchLocalVault]);

  return {
    chooseLocalVault,
    switchLocalVault,
    forgetLocalVault,
    openLocalVault,
    refreshLocalVault,
    revealLocalFolder,
    revealLocalNote,
  };
}
