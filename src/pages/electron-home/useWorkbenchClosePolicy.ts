import { useCallback, useEffect } from 'react';
import { toast } from '@/components/ui/toast';

import type {
  HackDeskCloseRequest,
  HackDeskElectronAPI,
} from '@/lib/electron-api';

import type { OpenNoteTab } from './note-workspace';

export type WorkbenchClosePolicyOptions = {
  api?: HackDeskElectronAPI;
  backupFailed?: boolean;
  closeTransientLayer: () => boolean;
  confirmCloseUnsafeTabs: (tabs: OpenNoteTab[], title: string, confirmLabel: string, draftDisposition?: 'discard' | 'retain') => Promise<boolean>;
  openTabs: Record<string, OpenNoteTab>;
};

export function useWorkbenchClosePolicy({
  api,
  backupFailed = false,
  closeTransientLayer,
  confirmCloseUnsafeTabs,
  openTabs,
}: WorkbenchClosePolicyOptions) {
  // Drafts in any workspace may exist only in memory, so one confirmation covers them all.
  const confirmCloseWithoutBackup = useCallback(async () => {
    if (!api?.app.confirm) return true;
    try {
      const { confirmed } = await api.app.confirm({
        title: 'Close HackDesk',
        message: 'Workspace backup failed. Close anyway?',
        detail: 'Unsaved drafts could not be backed up and will be lost. Copy or export them, or free storage space and retry the backup.',
        confirmLabel: 'Close',
        cancelLabel: 'Keep Editing',
        destructive: true,
      });
      return confirmed;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm close.');
      return false;
    }
  }, [api]);

  const settleCloseRequest = useCallback(async (request: HackDeskCloseRequest = { source: 'window-button' }) => {
    if (!api) {
      return;
    }

    const cancelClose = async () => {
      try {
        await api.app.cancelClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to cancel window close.');
      }
    };

    if (request.source !== 'app-quit' && closeTransientLayer()) {
      await cancelClose();
      return;
    }

    const allTabs = Object.values(openTabs);
    const confirmed = backupFailed
      ? await confirmCloseWithoutBackup()
      : await confirmCloseUnsafeTabs(allTabs, 'Close HackDesk', 'Close', 'retain');
    if (!confirmed) {
      await cancelClose();
      return;
    }

    try {
      await api.app.confirmClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to close window.');
    }
  }, [api, backupFailed, closeTransientLayer, confirmCloseUnsafeTabs, confirmCloseWithoutBackup, openTabs]);

  useEffect(() => (
    api?.app.onCloseRequest((request) => {
      void settleCloseRequest(request);
    })
  ), [api, settleCloseRequest]);

  return { settleCloseRequest };
}
