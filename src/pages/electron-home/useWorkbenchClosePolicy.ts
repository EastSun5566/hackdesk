import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';

import type {
  HackDeskCloseRequest,
  HackDeskElectronAPI,
} from '@/lib/electron-api';

import type { OpenNoteTab } from './note-workspace';

export type WorkbenchClosePolicyOptions = {
  activeTab: OpenNoteTab | null;
  api?: HackDeskElectronAPI;
  closeTransientLayer: () => boolean;
  confirmCloseUnsafeTabs: (tabs: OpenNoteTab[], title: string, confirmLabel: string) => Promise<boolean>;
  openTabs: Record<string, OpenNoteTab>;
  requestCloseTab: (tabId: string) => Promise<boolean>;
};

export function useWorkbenchClosePolicy({
  activeTab,
  api,
  closeTransientLayer,
  confirmCloseUnsafeTabs,
  openTabs,
  requestCloseTab,
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

    if (closeTransientLayer()) {
      await cancelClose();
      return;
    }

    if (request.source === 'keyboard-shortcut' && activeTab) {
      await requestCloseTab(activeTab.tabId);
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
  }, [activeTab, api, closeTransientLayer, confirmCloseUnsafeTabs, openTabs, requestCloseTab]);

  useEffect(() => (
    api?.app.onCloseRequest((request) => {
      void settleCloseRequest(request);
    })
  ), [api, settleCloseRequest]);

  return { settleCloseRequest };
}
