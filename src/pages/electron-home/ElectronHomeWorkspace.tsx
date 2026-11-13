import type { ComponentProps } from 'react';

import { MAX_NOTE_PANES } from '@/lib/electron-actions';

import { AppTopBar } from './AppTopBar';
import { DocumentWorkspace, type DocumentPaneView } from './DocumentWorkspace';
import { FolderNavigator } from './FolderNavigator';
import type { NotePane, NoteWorkspaceState, OpenNoteTab } from './note-workspace';
import { PanelResizeSash } from './PanelResizeSash';
import { NAVIGATOR_WIDTH_DEFAULT, NAVIGATOR_WIDTH_MAX, NAVIGATOR_WIDTH_MIN } from './ui-preferences';
import { WorkspaceBackupNotice, type WorkspaceBackupNoticeProps } from './WorkspaceBackupNotice';
import { WorkspaceNavigationProvider, type WorkspaceNavigation } from './WorkspaceNavigationContext';
import { WorkbenchDocumentActionsProvider, type WorkbenchDocumentActions } from './DocumentActionsContext';

export const NOTE_NAVIGATOR_PANEL_ID = 'note-navigator-panel';

type AppTopBarProps = ComponentProps<typeof AppTopBar>;
type FolderNavigatorProps = ComponentProps<typeof FolderNavigator>;

export type ElectronHomeWorkspaceProps = {
  backupNotice?: WorkspaceBackupNoticeProps | null;
  documentWorkspace: ComponentProps<typeof DocumentWorkspace>;
  /** What the panes do to their notes: save, delete, copy a link, upload an image. */
  documentActions: WorkbenchDocumentActions;
  navigator: Omit<FolderNavigatorProps, 'id'>;
  /** The workspace switcher in the sidebar title and the account row at its bottom. */
  workspaceNavigation: WorkspaceNavigation;
  navigatorResize: {
    disabled: boolean;
    value: number;
    onChange: (value: number) => void;
  };
  titlebar: {
    getPaneTabs: (pane: NotePane) => OpenNoteTab[];
    getPaneView: (pane: NotePane) => DocumentPaneView;
    getTabSyncState: AppTopBarProps['getTabSyncState'];
    layout: {
      navigatorCollapsed: boolean;
    };
    state: Pick<NoteWorkspaceState, 'scopeKey' | 'activePaneId' | 'backStack' | 'forwardStack' | 'panes' | 'recentlyClosedTabs' | 'zoomedPaneId'>;
    actions: {
      moveActiveTabToOtherPane: () => void;
      navigateBack: () => void;
      navigateForward: () => void;
      reopenLastClosedTab: () => void;
      requestCloseOtherTabs: (paneId: string, tabId: string) => Promise<unknown>;
      requestCloseTab: (tabId: string) => Promise<unknown>;
      requestCloseTabsToRight: (paneId: string, tabId: string) => Promise<unknown>;
      selectTab: (paneId: string, tabId: string) => void;
      keepTab: (tabId: string) => void;
      reorderTab: (paneId: string, tabId: string, overTabId: string) => void;
      splitActiveTab: () => void;
      splitActivePaneDown: () => void;
      togglePaneZoom: () => void;
      equalizePanes: () => void;
      toggleNavigator: () => void;
      onNewTab: () => void;
    };
  };
};

export function ElectronHomeWorkspace({
  backupNotice,
  documentWorkspace,
  documentActions,
  navigator,
  workspaceNavigation,
  navigatorResize,
  titlebar,
}: ElectronHomeWorkspaceProps) {
  const activeTitlebarPane = titlebar.state.panes.find((pane) => pane.paneId === titlebar.state.activePaneId) ?? null;
  const activeTitlebarPaneView = activeTitlebarPane ? titlebar.getPaneView(activeTitlebarPane) : null;
  const activeTitlebarTabs = activeTitlebarPane ? titlebar.getPaneTabs(activeTitlebarPane) : [];

  return (
    <>
      <AppTopBar
        tabStripId={`${titlebar.state.scopeKey}:${activeTitlebarPane?.paneId}`}
        paneId={activeTitlebarPane?.paneId}
        activeTab={activeTitlebarPaneView?.activeTab ?? null}
        getTabSyncState={titlebar.getTabSyncState}
        navigation={{
          canGoBack: titlebar.state.backStack.length > 0,
          canGoForward: titlebar.state.forwardStack.length > 0,
          onBack: titlebar.actions.navigateBack,
          onForward: titlebar.actions.navigateForward,
        }}
        onCloseOtherTabs={(tabId) => {
          if (activeTitlebarPane) {
            void titlebar.actions.requestCloseOtherTabs(activeTitlebarPane.paneId, tabId);
          }
        }}
        onCloseTab={(tabId) => {
          void titlebar.actions.requestCloseTab(tabId);
        }}
        onCloseTabsToRight={(tabId) => {
          if (activeTitlebarPane) {
            void titlebar.actions.requestCloseTabsToRight(activeTitlebarPane.paneId, tabId);
          }
        }}
        onReorderTab={(tabId, overTabId) => {
          if (activeTitlebarPane) titlebar.actions.reorderTab(activeTitlebarPane.paneId, tabId, overTabId);
        }}
        onMoveTabToOtherPane={titlebar.actions.moveActiveTabToOtherPane}
        onReopenLastClosedTab={titlebar.actions.reopenLastClosedTab}
        onSelectTab={(tabId) => {
          if (activeTitlebarPane) {
            titlebar.actions.selectTab(activeTitlebarPane.paneId, tabId);
          }
        }}
        onKeepTab={titlebar.actions.keepTab}
        onSplitPane={titlebar.actions.splitActiveTab}
        paneLayout={{
          zoomed: Boolean(titlebar.state.zoomedPaneId),
          onSplitDown: titlebar.actions.splitActivePaneDown,
          onToggleZoom: titlebar.actions.togglePaneZoom,
          onEqualize: titlebar.actions.equalizePanes,
        }}
        paneActions={{
          canMoveToOtherPane: titlebar.state.panes.length > 1,
          canReopenLastClosedTab: titlebar.state.recentlyClosedTabs.length > 0,
          canSplit: titlebar.state.panes.length < MAX_NOTE_PANES,
        }}
        platform={window.hackdeskAPI?.platform ?? 'unknown'}
        navigatorCollapsed={titlebar.layout.navigatorCollapsed}
        navigatorPanelId={NOTE_NAVIGATOR_PANEL_ID}
        tabs={activeTitlebarTabs}
        onToggleNavigator={titlebar.actions.toggleNavigator}
        onNewTab={titlebar.actions.onNewTab}
      />

      {backupNotice ? <WorkspaceBackupNotice {...backupNotice} /> : null}

      {/* Notes sit on cards a gap in from the window; the sidebar's resize handle is the gap beside it. */}
      {/* The gap left of the card while the sidebar is collapsed is the sidebar's own margin, so it
          grows as the sidebar narrows instead of shoving the sidebar aside the moment it starts. */}
      <main className="flex min-h-0 min-w-0 flex-1 pr-1.5 pb-1.5 [[data-hack-mode]_&]:p-0">
        <WorkspaceNavigationProvider value={workspaceNavigation}>
          <FolderNavigator id={NOTE_NAVIGATOR_PANEL_ID} {...navigator} />
        </WorkspaceNavigationProvider>
        <PanelResizeSash
          label="Resize sidebar"
          value={navigatorResize.value}
          min={NAVIGATOR_WIDTH_MIN}
          max={NAVIGATOR_WIDTH_MAX}
          defaultValue={NAVIGATOR_WIDTH_DEFAULT}
          disabled={navigatorResize.disabled}
          onChange={navigatorResize.onChange}
          previewTargetId={NOTE_NAVIGATOR_PANEL_ID}
          edge
          previewProperties={['--panel-width', '--sidebar-content-width']}
        />

        <WorkbenchDocumentActionsProvider value={documentActions}>
          <DocumentWorkspace {...documentWorkspace} />
        </WorkbenchDocumentActionsProvider>
      </main>
    </>
  );
}
