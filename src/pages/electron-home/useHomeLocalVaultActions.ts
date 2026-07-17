import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui/toast';
import type { HackDeskElectronAPI } from '@/lib/electron-api';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import type { WorkspaceScope } from './types';
import { getLocalVaultSnapshotQueryKey } from './useElectronLocalVault';

export type HomeLocalVaultActions = {
  chooseLocalVault: () => Promise<void>;
  forgetLocalVault: () => Promise<void>;
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
  api: HackDeskElectronAPI | undefined;
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
      return;
    }

    if (result.settings) {
      queryClient.setQueryData(['electron', 'settings'], result.settings);
    }
    if (result.snapshot) {
      queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), result.snapshot);
    }
    setWorkspaceScope({ type: 'local', label: 'Local Vault' });
  }, [api, queryClient, setWorkspaceScope]);

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

  const forgetLocalVault = useCallback(async () => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    const { confirmed } = await api.app.confirm({
      title: 'Forget Local Vault',
      message: 'Forget this local vault?',
      detail: 'HackDesk will stop opening this folder automatically. Your Markdown files will not be deleted.',
      confirmLabel: 'Forget Vault',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    const nextSettings = await api.localVault.disconnect();
    queryClient.setQueryData(['electron', 'settings'], nextSettings);
    queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), null);
    toast.success('Local vault forgotten.', { description: 'Markdown files were not deleted.' });
  }, [api, queryClient]);

  const refreshLocalVault = useCallback(async () => {
    await refetchLocalVault();
  }, [refetchLocalVault]);

  return {
    chooseLocalVault,
    forgetLocalVault,
    openLocalVault,
    refreshLocalVault,
    revealLocalFolder,
    revealLocalNote,
  };
}
