import { useCallback, useEffect } from 'react';
import { toast } from '@/components/ui/toast';

import type {
  HackDeskCloseRequest,
  HackDeskElectronAPI,
} from '@/lib/electron-api';

import type { OpenNoteTab } from './note-workspace';

export type WorkbenchClosePolicyOptions = {
  api?: HackDeskElectronAPI;
  closeTransientLayer: () => boolean;
  confirmCloseUnsafeTabs: (tabs: OpenNoteTab[], title: string, confirmLabel: string) => Promise<boolean>;
  openTabs: Record<string, OpenNoteTab>;
};

export function useWorkbenchClosePolicy({
  api,
  closeTransientLayer,
  confirmCloseUnsafeTabs,
  openTabs,
}: WorkbenchClosePolicyOptions) {
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
    if (!await confirmCloseUnsafeTabs(allTabs, 'Close HackDesk', 'Close')) {
      await cancelClose();
      return;
    }

    try {
      await api.app.confirmClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to close window.');
    }
  }, [api, closeTransientLayer, confirmCloseUnsafeTabs, openTabs]);

  useEffect(() => (
    api?.app.onCloseRequest((request) => {
      void settleCloseRequest(request);
    })
  ), [api, settleCloseRequest]);

  return { settleCloseRequest };
}
