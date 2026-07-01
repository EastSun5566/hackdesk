import type { ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';

import type { ElectronHomeOverlaysProps } from './ElectronHomeOverlays';
import type { HomeLocalVaultActions } from './useHomeLocalVaultActions';
import type { WorkspaceScope } from './types';
import type { useElectronNoteMutations } from './useElectronNoteMutations';
import type { useWorkbenchActions } from './useWorkbenchActions';
import type { useWorkbenchDialogState } from './useWorkbenchDialogState';

type DialogState = ReturnType<typeof useWorkbenchDialogState>;
type NoteMutations = ReturnType<typeof useElectronNoteMutations>;
type WorkbenchActions = ReturnType<typeof useWorkbenchActions>;

export function useHomeOverlayProps({
  actionContext,
  api,
  commandPaletteProps,
  dialogState,
  displayScope,
  localVaultActions,
  localVaultError,
  localVaultSnapshot,
  mutations,
  onboardingOpen,
  runAction,
  selectedFolderLabel,
  onOnboardingConnected,
  setOnboardingOpen,
  settings,
}: {
  actionContext: WorkbenchActions['actionContext'];
  api: HackDeskElectronAPI | undefined;
  commandPaletteProps: Omit<ElectronHomeOverlaysProps['commandPalette'], 'context' | 'onRunAction'>;
  dialogState: DialogState;
  displayScope: WorkspaceScope;
  localVaultActions: HomeLocalVaultActions;
  localVaultError: string | null;
  localVaultSnapshot: ElectronHomeOverlaysProps['dialogs']['localVaultSnapshot'];
  mutations: NoteMutations;
  onboardingOpen: boolean;
  runAction: WorkbenchActions['runAction'];
  selectedFolderLabel: string | null;
  onOnboardingConnected: () => void;
  setOnboardingOpen: (open: boolean) => void;
  settings: ElectronSafeSettings | undefined;
}): ElectronHomeOverlaysProps {
  return {
    commandPalette: {
      ...commandPaletteProps,
      context: actionContext,
      onRunAction: runAction,
    },
    dialogs: {
      api,
      createFolderDialog: dialogState.createFolderDialog,
      createNoteDialog: dialogState.createDialog,
      deleteFolderTarget: dialogState.deleteFolderTarget,
      deleteNoteTarget: dialogState.deleteTarget,
      folderLabel: selectedFolderLabel,
      onboardingOpen,
      renameFolderDialog: dialogState.renameFolderDialog,
      scopeLabel: displayScope.label,
      settings,
      localVaultError,
      localVaultSnapshot,
      settingsOpen: dialogState.settingsOpen,
      status: {
        creatingFolder: mutations.createFolderMutation.isPending,
        creatingNote: mutations.createNoteMutation.isPending,
        deletingFolder: mutations.deleteFolderMutation.isPending,
        deletingNote: mutations.deleteNoteMutation.isPending,
        renamingFolder: mutations.renameFolderMutation.isPending,
        savingSettings: mutations.updateSettingsMutation.isPending,
      },
      onCreateFolder: (input) => mutations.createFolderMutation.mutate(input),
      onCreateFolderStateChange: dialogState.setCreateFolderDialog,
      onCreateNote: (title) => mutations.createNoteMutation.mutate(title),
      onCreateNoteStateChange: dialogState.setCreateDialog,
      onChooseLocalVault: localVaultActions.chooseLocalVault,
      onDeleteFolder: (folder) => mutations.deleteFolderMutation.mutate({
        folderId: folder.id,
        parentFolderId: folder.parentId,
      }),
      onDeleteFolderCancel: () => dialogState.setDeleteFolderTarget(null),
      onDeleteNote: (note) => mutations.deleteNoteMutation.mutate(note),
      onDeleteNoteCancel: () => dialogState.setDeleteTarget(null),
      onImportHackmdCliToken: () => mutations.importHackmdCliTokenMutation.mutateAsync(),
      onForgetLocalVault: localVaultActions.forgetLocalVault,
      onOpenLocalVault: localVaultActions.openLocalVault,
      onOnboardingConnected,
      onOnboardingOpenChange: setOnboardingOpen,
      onRefreshLocalVault: localVaultActions.refreshLocalVault,
      onRenameFolder: (folderId, input) => mutations.renameFolderMutation.mutate({ folderId, input }),
      onRenameFolderStateChange: dialogState.setRenameFolderDialog,
      onSaveSettings: (input) => mutations.updateSettingsMutation.mutate(input),
      onSaveToken: async (token) => {
        await mutations.updateSettingsMutation.mutateAsync({
          title: settings?.title ?? 'HackDesk',
          hackmdApiToken: token,
        });
      },
      onSettingsOpenChange: dialogState.setSettingsOpen,
      onSetupLater: async () => {
        await mutations.updateSettingsMutation.mutateAsync({
          title: settings?.title ?? 'HackDesk',
          onboarding: { hackmdTokenSetupDeferred: true },
        });
      },
    },
  };
}
