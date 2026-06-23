import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { toast } from 'sonner';

import type {
  HackDeskElectronAPI,
  NoteSummary,
} from '@/lib/electron-api';
import type { FolderTreeNote } from '@/lib/hackmd-folders';

import type { DocumentSyncState } from './DocumentDetail';
import type { NotePane, OpenNoteTab } from './note-workspace';

export type WorkbenchTabLifecycleOptions = {
  api?: HackDeskElectronAPI;
  autoSelectSuppressionRef: MutableRefObject<string | null>;
  closeOtherTabs: (paneId: string, keepTabId: string) => void;
  closeTab: (tabId: string) => void;
  closeTabsToRight: (paneId: string, tabId: string) => void;
  focusEditor: () => void;
  getAutoSelectSuppressionKey: (note: NoteSummary | null) => string;
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  getTabTitle: (tab: OpenNoteTab) => string;
  isTabDirty: (tab: OpenNoteTab) => boolean;
  manualEmptyWorkspaceRef: MutableRefObject<boolean>;
  panes: NotePane[];
  activePaneId: string;
  tabs: Record<string, OpenNoteTab>;
  visibleEntries: FolderTreeNote[];
  selectTab: (paneId: string, tabId: string) => void;
};

export function useWorkbenchTabLifecycle({
  api,
  autoSelectSuppressionRef,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  focusEditor,
  getAutoSelectSuppressionKey,
  getTabSyncState,
  getTabTitle,
  isTabDirty,
  manualEmptyWorkspaceRef,
  panes,
  activePaneId,
  tabs,
  visibleEntries,
  selectTab,
}: WorkbenchTabLifecycleOptions) {
  const getUnsafeTabs = useCallback((candidateTabs: OpenNoteTab[]) => (
    candidateTabs.filter((tab) => isTabDirty(tab) || getTabSyncState(tab) === 'save_failed')
  ), [getTabSyncState, isTabDirty]);

  const confirmCloseUnsafeTabs = useCallback(async (candidateTabs: OpenNoteTab[], title: string, confirmLabel: string) => {
    const unsafeTabs = getUnsafeTabs(candidateTabs);
    if (unsafeTabs.length === 0 || !api?.app.confirm) {
      return true;
    }

    const firstTitle = getTabTitle(unsafeTabs[0]) || 'Untitled';
    const failedCount = unsafeTabs.filter((tab) => getTabSyncState(tab) === 'save_failed').length;
    const dirtyCount = unsafeTabs.length - failedCount;
    const detailParts = [
      dirtyCount > 0 ? `${dirtyCount} note${dirtyCount === 1 ? ' has' : 's have'} unsaved changes` : null,
      failedCount > 0 ? `${failedCount} note${failedCount === 1 ? ' has' : 's have'} a failed save` : null,
    ].filter(Boolean);

    try {
      const { confirmed } = await api.app.confirm({
        title,
        message: unsafeTabs.length === 1 ? `Close “${firstTitle}”?` : `Close ${unsafeTabs.length} unsaved notes?`,
        detail: `${detailParts.join(' and ')}. Closing will discard local drafts that have not been saved to HackMD.`,
        confirmLabel,
        cancelLabel: 'Keep Editing',
        destructive: true,
      });
      return confirmed;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm close.');
      return false;
    }
  }, [api, getTabSyncState, getTabTitle, getUnsafeTabs]);

  const requestCloseTab = useCallback(async (tabId: string) => {
    const tab = tabs[tabId];
    if (!tab) {
      return false;
    }

    if (!await confirmCloseUnsafeTabs([tab], 'Close Tab', 'Close Tab')) {
      return false;
    }

    if (Object.keys(tabs).length <= 1) {
      const nextNote = visibleEntries[0]?.note ?? null;
      manualEmptyWorkspaceRef.current = true;
      autoSelectSuppressionRef.current = nextNote ? getAutoSelectSuppressionKey(nextNote) : null;
    }

    closeTab(tabId);
    return true;
  }, [
    autoSelectSuppressionRef,
    closeTab,
    confirmCloseUnsafeTabs,
    getAutoSelectSuppressionKey,
    manualEmptyWorkspaceRef,
    tabs,
    visibleEntries,
  ]);

  const requestCloseOtherTabs = useCallback(async (paneId: string, keepTabId: string) => {
    const pane = panes.find((candidate) => candidate.paneId === paneId);
    if (!pane) {
      return;
    }

    const closingTabs = pane.tabIds
      .filter((tabId) => tabId !== keepTabId)
      .map((tabId) => tabs[tabId])
      .filter((tab): tab is OpenNoteTab => Boolean(tab));
    if (!await confirmCloseUnsafeTabs(closingTabs, 'Close Other Tabs', 'Close Other Tabs')) {
      return;
    }

    closeOtherTabs(paneId, keepTabId);
  }, [closeOtherTabs, confirmCloseUnsafeTabs, panes, tabs]);

  const requestCloseTabsToRight = useCallback(async (paneId: string, tabId: string) => {
    const pane = panes.find((candidate) => candidate.paneId === paneId);
    const tabIndex = pane?.tabIds.indexOf(tabId) ?? -1;
    if (!pane || tabIndex < 0) {
      return;
    }

    const closingTabs = pane.tabIds
      .slice(tabIndex + 1)
      .map((candidate) => tabs[candidate])
      .filter((tab): tab is OpenNoteTab => Boolean(tab));
    if (!await confirmCloseUnsafeTabs(closingTabs, 'Close Tabs to Right', 'Close Tabs')) {
      return;
    }

    closeTabsToRight(paneId, tabId);
  }, [closeTabsToRight, confirmCloseUnsafeTabs, panes, tabs]);

  const focusTabAtIndex = useCallback((tabIndex: number) => {
    const activePane = panes.find((pane) => pane.paneId === activePaneId);
    if (!activePane) {
      return false;
    }

    const normalizedIndex = tabIndex === -1 ? activePane.tabIds.length - 1 : tabIndex;
    const tabId = activePane.tabIds[normalizedIndex];
    if (!tabId) {
      return false;
    }

    selectTab(activePane.paneId, tabId);
    focusEditor();
    return true;
  }, [activePaneId, focusEditor, panes, selectTab]);

  return {
    confirmCloseUnsafeTabs,
    focusTabAtIndex,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
  };
}
