import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

import type { HackDeskElectronAPI } from '@/lib/electron-api';
import { buildMarkdownExportInput } from '@/lib/electron-note-portability';

import type { NoteWorkspaceState, OpenNoteTab } from './note-workspace';
import { writeClipboardText } from './useDocumentCommands';
import type { WorkspaceBackupNoticeProps } from './WorkspaceBackupNotice';

export type WorkspaceBackupNoticeOptions = {
  api?: HackDeskElectronAPI;
  workspace: {
    activeTab: OpenNoteTab | null;
    state: Pick<NoteWorkspaceState, 'drafts'>;
    backupFailed: boolean;
    backupFailedInOtherWorkspace: boolean;
    retryBackup: () => boolean;
  };
};

export function useWorkspaceBackupNotice({ api, workspace }: WorkspaceBackupNoticeOptions): WorkspaceBackupNoticeProps | null {
  const { activeTab, backupFailed, backupFailedInOtherWorkspace, retryBackup } = workspace;
  const draft = activeTab ? workspace.state.drafts[activeTab.tabId] ?? null : null;

  const copyDraft = useCallback(() => {
    if (!draft) return;
    void writeClipboardText(api, draft.content)
      .then(() => toast.success('Draft copied.'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy draft.'));
  }, [api, draft]);

  const exportDraft = useCallback(() => {
    if (!draft || !api) return;
    void api.app.saveTextFile(buildMarkdownExportInput(draft.title, draft.content))
      .then((filePath) => {
        if (filePath) toast.success('Draft exported.', { description: filePath });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to export draft.'));
  }, [api, draft]);

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
    otherWorkspaceAffected: backupFailedInOtherWorkspace,
    onCopyDraft: copyDraft,
    onExportDraft: exportDraft,
    onRetry: retry,
  };
}
