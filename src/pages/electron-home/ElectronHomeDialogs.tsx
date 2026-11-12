import { toast } from '@/components/ui/toast';

import type {
  DocumentSummary,
  ElectronSafeSettings,
  CreateFolderInput,
  HackDeskElectronAPI,
  ImportHackmdCliTokenResult,
  UpdateFolderInput,
  UserSummary,
} from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import type { FolderTreeNode } from '@/lib/hackmd-folders';

import { CreateFolderDialog } from './CreateFolderDialog';
import { CreateNoteDialog } from './CreateNoteDialog';
import { DeleteFolderDialog } from './DeleteFolderDialog';
import { DeleteNoteDialog } from './DeleteNoteDialog';
import { HackmdOnboardingDialog } from './HackmdOnboardingDialog';
import type { LocalWorkspaceSettingsActions } from './VaultSettingsPanel';
import { RenameFolderDialog } from './RenameFolderDialog';
import { SettingsDialog } from './SettingsDialog';
import type {
  CreateFolderDialogState,
  CreateNoteDialogState,
  RenameFolderDialogState,
  SettingsFormInput,
} from './types';
import { useOverlay, useOverlayControls } from './WorkbenchOverlaysContext';

export type ElectronHomeDialogsProps = {
  api?: HackDeskElectronAPI;
  folderLabel: string | null;
  scopeLabel: string;
  settings?: ElectronSafeSettings;
  localVaultError?: string | null;
  localVaultSnapshot?: LocalVaultSnapshot | null;
  status: {
    creatingFolder: boolean;
    creatingNote: boolean;
    deletingFolder: boolean;
    deletingNote: boolean;
    renamingFolder: boolean;
    savingSettings: boolean;
  };
  onCreateFolder: (input: CreateFolderInput) => void;
  onCreateNote: (title: string) => void;
  onChooseNoteLocation?: () => void;
  onChooseLocalVault: () => Promise<void | boolean>;
  onDisconnectHackmd: () => void;
  onOnboardingConnected: () => void;
  onDeleteFolder: (folder: FolderTreeNode) => void;
  onDeleteNote: (note: DocumentSummary) => void;
  onImportHackmdCliToken: () => Promise<ImportHackmdCliTokenResult>;
  onForgetLocalVault: (vaultId?: string) => Promise<void>;
  onSwitchLocalVault: (vaultId: string) => Promise<void>;
  localWorkspaceActions?: LocalWorkspaceSettingsActions;
  onOpenLocalVault: () => Promise<void>;
  onOnboardingOpenChange: (open: boolean) => void;
  onRefreshLocalVault: () => Promise<void>;
  onRenameFolder: (folderId: string, input: UpdateFolderInput) => void;
  onSaveSettings: (input: SettingsFormInput) => void;
  onSaveToken: (token: string, label?: string) => Promise<void>;
  onSetupLater: () => Promise<void>;
};

export function ElectronHomeDialogs({
  api,
  folderLabel,
  scopeLabel,
  settings,
  localVaultError,
  localVaultSnapshot,
  status,
  onCreateFolder,
  onCreateNote,
  onChooseNoteLocation,
  onChooseLocalVault,
  onDisconnectHackmd,
  onOnboardingConnected,
  onDeleteFolder,
  onDeleteNote,
  onImportHackmdCliToken,
  onForgetLocalVault,
  onSwitchLocalVault,
  localWorkspaceActions,
  onOpenLocalVault,
  onOnboardingOpenChange,
  onRefreshLocalVault,
  onRenameFolder,
  onSaveSettings,
  onSaveToken,
  onSetupLater,
}: ElectronHomeDialogsProps) {
  // Each dialog's state comes from the workbench overlays, so only its own changes re-render it.
  const overlayControls = useOverlayControls();
  const createFolderDialog = useOverlay((overlays) => overlays.createFolder);
  const createNoteDialog = useOverlay((overlays) => overlays.createNote);
  const renameFolderDialog = useOverlay((overlays) => overlays.renameFolder);
  const deleteFolderTarget = useOverlay((overlays) => overlays.deleteFolder);
  const deleteNoteTarget = useOverlay((overlays) => overlays.deleteNote);
  const onboardingOpen = useOverlay((overlays) => overlays.onboarding);
  const settingsOpen = useOverlay((overlays) => overlays.settings.open);
  const settingsInitialTab = useOverlay((overlays) => overlays.settings.tab);
  const onCreateFolderStateChange = (state: CreateFolderDialogState) => overlayControls.set('createFolder', state);
  const onCreateNoteStateChange = (state: CreateNoteDialogState) => overlayControls.set('createNote', state);
  const onRenameFolderStateChange = (state: RenameFolderDialogState) => overlayControls.set('renameFolder', state);
  const onDeleteFolderCancel = () => overlayControls.close('deleteFolder');
  const onDeleteNoteCancel = () => overlayControls.close('deleteNote');
  const onSettingsOpenChange = (open: boolean) => (open ? overlayControls.openSettings() : overlayControls.close('settings'));
  const validateToken = (token: string) => {
    if (!api) {
      return Promise.reject(new Error('Electron API is unavailable.'));
    }

    return api.hackmd.validateToken(token);
  };

  return (
    <>
      <SettingsDialog
        open={settingsOpen}
        initialTab={settingsInitialTab}
        settings={settings}
        platform={api?.platform ?? navigator.platform}
        localVaultError={localVaultError}
        localVaultSnapshot={localVaultSnapshot}
        isSaving={status.savingSettings}
        onChooseLocalVault={onChooseLocalVault}
        onDisconnectHackmd={onDisconnectHackmd}
        onForgetLocalVault={onForgetLocalVault}
        onSwitchLocalVault={onSwitchLocalVault}
        localWorkspaceActions={localWorkspaceActions}
        onOpenLocalVault={onOpenLocalVault}
        onRefreshLocalVault={onRefreshLocalVault}
        onOpenChange={onSettingsOpenChange}
        onSave={onSaveSettings}
        onValidateToken={validateToken}
      />

      <HackmdOnboardingDialog
        open={onboardingOpen}
        onOpenChange={onOnboardingOpenChange}
        hackmdCliConfig={settings?.hackmdCliConfig ?? { hasAccessToken: false, hasCustomEndpoint: false }}
        onChooseLocalVault={onChooseLocalVault}
        onConnected={onOnboardingConnected}
        onImportHackmdCliToken={onImportHackmdCliToken}
        onOpenHackmdSettings={() => {
          void api?.shell.openExternal('https://hackmd.io/settings#api').catch((error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to open HackMD settings.');
          });
        }}
        onSaveToken={onSaveToken}
        onSetupLater={onSetupLater}
        onValidateToken={validateToken as (token: string) => Promise<UserSummary>}
      />

      <CreateNoteDialog
        state={createNoteDialog}
        scopeLabel={scopeLabel}
        folderLabel={folderLabel}
        isCreating={status.creatingNote}
        onStateChange={onCreateNoteStateChange}
        onCreate={onCreateNote}
        onChooseLocation={onChooseNoteLocation}
      />

      <CreateFolderDialog
        state={createFolderDialog}
        scopeLabel={scopeLabel}
        parentFolderLabel={folderLabel}
        isCreating={status.creatingFolder}
        onStateChange={onCreateFolderStateChange}
        onCreate={onCreateFolder}
      />

      <RenameFolderDialog
        state={renameFolderDialog}
        isRenaming={status.renamingFolder}
        onStateChange={onRenameFolderStateChange}
        onRename={onRenameFolder}
      />

      <DeleteFolderDialog
        folder={deleteFolderTarget}
        isDeleting={status.deletingFolder}
        onCancel={onDeleteFolderCancel}
        onDelete={onDeleteFolder}
      />

      <DeleteNoteDialog
        note={deleteNoteTarget}
        isDeleting={status.deletingNote}
        onCancel={onDeleteNoteCancel}
        onDelete={onDeleteNote}
      />
    </>
  );
}
