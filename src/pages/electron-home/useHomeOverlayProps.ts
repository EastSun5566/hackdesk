import type { ElectronSafeSettings, HackDeskElectronAPI, UserSummary } from '@/lib/electron-api';

import type { ElectronHomeOverlaysProps } from './ElectronHomeOverlays';
import type { HomeLocalVaultActions } from './useHomeLocalVaultActions';
import type { WorkspaceScope } from './types';
import type { useElectronNoteMutations } from './useElectronNoteMutations';
import type { useWorkbenchActions } from './useWorkbenchActions';
import type { OverlayControls, WorkbenchOverlays } from './workbench-overlays';

type NoteMutations = ReturnType<typeof useElectronNoteMutations>;
type WorkbenchActions = ReturnType<typeof useWorkbenchActions>;
type CommandPaletteInjectedProps =
  | 'context'
  | 'hasHackmdApiToken'
  | 'onConnectHackmd'
  | 'onMoveNoteToFolder'
  | 'onOpenSettingsTab'
  | 'onRunAction'
  | 'themeMode'
  | 'themePresetId'
  | 'themePresets'
  | 'onSelectThemeMode'
  | 'onSelectThemePreset'
  | 'platform'
  | 'shortcuts';

export function useHomeOverlayProps({
  actionContext,
  api,
  commandPaletteProps,
  commandPaletteTheme,
  commandPaletteUtilities,
  overlays,
  overlayControls,
  displayScope,
  localVaultActions,
  localVaultError,
  localVaultSnapshot,
  mutations,
  onHackmdDisconnected,
  onChooseNoteLocation,
  runAction,
  selectedFolderLabel,
  onOnboardingConnected,
  settings,
  user,
}: {
  actionContext: WorkbenchActions['actionContext'];
  api: HackDeskElectronAPI | undefined;
  commandPaletteProps: Omit<ElectronHomeOverlaysProps['commandPalette'], CommandPaletteInjectedProps>;
  commandPaletteTheme: Pick<
    ElectronHomeOverlaysProps['commandPalette'],
    'themeMode' | 'themePresetId' | 'themePresets' | 'onSelectThemeMode' | 'onSelectThemePreset'
  >;
  commandPaletteUtilities: Pick<
    ElectronHomeOverlaysProps['commandPalette'],
    | 'hasHackmdApiToken'
    | 'onConnectHackmd'
    | 'onMoveNoteToFolder'
    | 'onOpenSettingsTab'
  >;
  overlays: WorkbenchOverlays;
  overlayControls: OverlayControls;
  displayScope: WorkspaceScope;
  localVaultActions: HomeLocalVaultActions;
  localVaultError: string | null;
  localVaultSnapshot: ElectronHomeOverlaysProps['dialogs']['localVaultSnapshot'];
  mutations: NoteMutations;
  onHackmdDisconnected: () => void;
  onChooseNoteLocation?: () => void;
  runAction: WorkbenchActions['runAction'];
  selectedFolderLabel: string | null;
  onOnboardingConnected: () => void;
  settings: ElectronSafeSettings | undefined;
  user: UserSummary | undefined;
}): ElectronHomeOverlaysProps {
  return {
    commandPalette: {
      ...commandPaletteProps,
      ...commandPaletteTheme,
      ...commandPaletteUtilities,
      context: actionContext,
      onRunAction: runAction,
      platform: api?.platform ?? navigator.platform,
      shortcuts: settings?.shortcuts,
      user,
    },
    dialogs: {
      api,
      createFolderDialog: overlays.createFolder,
      createNoteDialog: overlays.createNote,
      deleteFolderTarget: overlays.deleteFolder,
      deleteNoteTarget: overlays.deleteNote,
      folderLabel: selectedFolderLabel,
      onboardingOpen: overlays.onboarding,
      renameFolderDialog: overlays.renameFolder,
      scopeLabel: displayScope.label,
      settings,
      localVaultError,
      localVaultSnapshot,
      settingsOpen: overlays.settings.open,
      status: {
        creatingFolder: mutations.createFolderMutation.isPending,
        creatingNote: mutations.createNoteMutation.isPending,
        deletingFolder: mutations.deleteFolderMutation.isPending,
        deletingNote: mutations.deleteNoteMutation.isPending,
        renamingFolder: mutations.renameFolderMutation.isPending,
        savingSettings:
          mutations.updateSettingsMutation.isPending || mutations.disconnectHackmdMutation.isPending,
      },
      onCreateFolder: (input) => mutations.createFolderMutation.mutate(input),
      onCreateFolderStateChange: (state) => overlayControls.set('createFolder', state),
      onCreateNote: (title) => mutations.createNoteMutation.mutate(title),
      onChooseNoteLocation,
      onCreateNoteStateChange: (state) => overlayControls.set('createNote', state),
      onChooseLocalVault: localVaultActions.chooseLocalVault,
      onDisconnectHackmd: () => {
        mutations.disconnectHackmdMutation.mutate(undefined, {
          onSuccess: onHackmdDisconnected,
        });
      },
      onDeleteFolder: (folder) => mutations.deleteFolderMutation.mutate({
        folderId: folder.id,
        parentFolderId: folder.parentId,
      }),
      onDeleteFolderCancel: () => overlayControls.close('deleteFolder'),
      onDeleteNote: (note) => mutations.deleteNoteMutation.mutate(note),
      onDeleteNoteCancel: () => overlayControls.close('deleteNote'),
      onImportHackmdCliToken: () => mutations.importHackmdCliTokenMutation.mutateAsync(),
      onForgetLocalVault: localVaultActions.forgetLocalVault,
      onSwitchLocalVault: localVaultActions.switchLocalVault,
      localWorkspaceActions: {
        create: localVaultActions.createLocalWorkspace,
        rename: localVaultActions.renameLocalWorkspace,
        remove: localVaultActions.deleteLocalWorkspace,
        activate: localVaultActions.activateLocalWorkspace,
        setVaults: localVaultActions.setLocalWorkspaceFolders,
      },
      onOpenLocalVault: localVaultActions.openLocalVault,
      onOnboardingConnected,
      onOnboardingOpenChange: (open) => overlayControls.set('onboarding', open),
      onRefreshLocalVault: localVaultActions.refreshLocalVault,
      onRenameFolder: (folderId, input) => mutations.renameFolderMutation.mutate({ folderId, input }),
      onRenameFolderStateChange: (state) => overlayControls.set('renameFolder', state),
      onSaveSettings: (input) => { void mutations.submitSettings(input); },
      onSaveToken: async (token, label) => {
        await mutations.updateSettingsMutation.mutateAsync({
          title: settings?.title ?? 'HackDesk',
          hackmdApiToken: token,
          ...(label ? { hackmdAccountLabel: label } : {}),
        });
      },
      onSettingsOpenChange: (open) => (open ? overlayControls.openSettings() : overlayControls.close('settings')),
      onSetupLater: async () => {
        await mutations.updateSettingsMutation.mutateAsync({
          title: settings?.title ?? 'HackDesk',
          onboarding: { hackmdTokenSetupDeferred: true },
        });
      },
    },
  };
}
