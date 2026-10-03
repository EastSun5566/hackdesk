import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

import type { HackDeskElectronAPI } from '@/lib/electron-api';

import type { NoteWorkspaceState, OpenNoteTab } from './note-workspace';
import { useDraftTextActions } from './useDraftTextActions';
import type { WorkspaceBackupNoticeProps } from './WorkspaceBackupNotice';

export type WorkspaceBackupNoticeOptions = {
  api?: HackDeskElectronAPI;
  workspace: {
    activeTab: OpenNoteTab | null;
    state: Pick<NoteWorkspaceState, 'drafts'>;
    backupFailed: boolean;
    backupFailedInCurrentWorkspace: boolean;
    backupFailedInOtherWorkspace: boolean;
    retryBackup: () => boolean;
  };
};

export function useWorkspaceBackupNotice({ api, workspace }: WorkspaceBackupNoticeOptions): WorkspaceBackupNoticeProps | null {
  const { activeTab, backupFailed, backupFailedInCurrentWorkspace, backupFailedInOtherWorkspace, retryBackup } = workspace;
  const draft = activeTab ? workspace.state.drafts[activeTab.tabId] ?? null : null;

  const { copyDraftText, exportDraftText } = useDraftTextActions(api);
  const copyDraft = useCallback(() => {
    if (draft) copyDraftText(draft.content);
  }, [copyDraftText, draft]);

  const exportDraft = useCallback(() => {
    if (draft) exportDraftText(draft.title, draft.content);
  }, [draft, exportDraftText]);

  const retry = useCallback(() => {
    if (retryBackup()) {
      toast.success('Workspace backed up.');
    } else {
      toast.error('Backup still failed. Free storage space, or copy or export your drafts.');
    }
  }, [retryBackup]);

  if (!backupFailed) return null;
  return {
    hasActiveDraft: !!draft,
    currentWorkspaceAffected: backupFailedInCurrentWorkspace,
    otherWorkspaceAffected: backupFailedInOtherWorkspace,
    onCopyDraft: copyDraft,
    onExportDraft: exportDraft,
    onRetry: retry,
  };
}
