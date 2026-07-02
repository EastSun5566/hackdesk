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
import { RenameFolderDialog } from './RenameFolderDialog';
import { SettingsDialog } from './SettingsDialog';
import type {
  CreateFolderDialogState,
  CreateNoteDialogState,
  RenameFolderDialogState,
  SettingsFormInput,
} from './types';

export type ElectronHomeDialogsProps = {
  api?: HackDeskElectronAPI;
  createFolderDialog: CreateFolderDialogState;
  createNoteDialog: CreateNoteDialogState;
  deleteFolderTarget: FolderTreeNode | null;
  deleteNoteTarget: DocumentSummary | null;
  folderLabel: string | null;
  onboardingOpen: boolean;
  renameFolderDialog: RenameFolderDialogState;
  scopeLabel: string;
  settings?: ElectronSafeSettings;
  localVaultError?: string | null;
  localVaultSnapshot?: LocalVaultSnapshot | null;
  settingsOpen: boolean;
  status: {
    creatingFolder: boolean;
    creatingNote: boolean;
    deletingFolder: boolean;
    deletingNote: boolean;
    renamingFolder: boolean;
    savingSettings: boolean;
  };
  onCreateFolder: (input: CreateFolderInput) => void;
  onCreateFolderStateChange: (state: CreateFolderDialogState) => void;
  onCreateNote: (title: string) => void;
  onCreateNoteStateChange: (state: CreateNoteDialogState) => void;
  onChooseLocalVault: () => Promise<void>;
  onDisconnectHackmd: () => void;
  onOnboardingConnected: () => void;
  onDeleteFolder: (folder: FolderTreeNode) => void;
  onDeleteFolderCancel: () => void;
  onDeleteNote: (note: DocumentSummary) => void;
  onDeleteNoteCancel: () => void;
  onImportHackmdCliToken: () => Promise<ImportHackmdCliTokenResult>;
  onForgetLocalVault: () => Promise<void>;
  onOpenLocalVault: () => Promise<void>;
  onOnboardingOpenChange: (open: boolean) => void;
  onRefreshLocalVault: () => Promise<void>;
  onRenameFolder: (folderId: string, input: UpdateFolderInput) => void;
  onRenameFolderStateChange: (state: RenameFolderDialogState) => void;
  onSaveSettings: (input: SettingsFormInput) => void;
  onSaveToken: (token: string) => Promise<void>;
  onSettingsOpenChange: (open: boolean) => void;
  onSetupLater: () => Promise<void>;
};

export function ElectronHomeDialogs({
  api,
  createFolderDialog,
  createNoteDialog,
  deleteFolderTarget,
  deleteNoteTarget,
  folderLabel,
  onboardingOpen,
  renameFolderDialog,
  scopeLabel,
  settings,
  localVaultError,
  localVaultSnapshot,
  settingsOpen,
  status,
  onCreateFolder,
  onCreateFolderStateChange,
  onCreateNote,
  onCreateNoteStateChange,
  onChooseLocalVault,
  onDisconnectHackmd,
  onOnboardingConnected,
  onDeleteFolder,
  onDeleteFolderCancel,
  onDeleteNote,
  onDeleteNoteCancel,
  onImportHackmdCliToken,
  onForgetLocalVault,
  onOpenLocalVault,
  onOnboardingOpenChange,
  onRefreshLocalVault,
  onRenameFolder,
  onRenameFolderStateChange,
  onSaveSettings,
  onSaveToken,
  onSettingsOpenChange,
  onSetupLater,
}: ElectronHomeDialogsProps) {
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
        settings={settings}
        localVaultError={localVaultError}
        localVaultSnapshot={localVaultSnapshot}
        isSaving={status.savingSettings}
        onChooseLocalVault={onChooseLocalVault}
        onDisconnectHackmd={onDisconnectHackmd}
        onForgetLocalVault={onForgetLocalVault}
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
