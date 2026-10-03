import type { ComponentProps } from 'react';

import { AppTopBar } from './AppTopBar';
import { DocumentWorkspace, type DocumentPaneView } from './DocumentWorkspace';
import { FolderNavigator } from './FolderNavigator';
import type { NotePane, NoteWorkspaceState, OpenNoteTab } from './note-workspace';
import { PanelResizeSash } from './PanelResizeSash';
import {
  NAVIGATOR_WIDTH_DEFAULT,
  NAVIGATOR_WIDTH_MAX,
  NAVIGATOR_WIDTH_MIN,
  RAIL_WIDTH_DEFAULT,
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
} from './ui-preferences';
import { WorkspaceBackupNotice, type WorkspaceBackupNoticeProps } from './WorkspaceBackupNotice';
import { WorkspaceRail } from './WorkspaceRail';

const WORKSPACE_RAIL_PANEL_ID = 'workspace-rail-panel';
const NOTE_NAVIGATOR_PANEL_ID = 'note-navigator-panel';

type AppTopBarProps = ComponentProps<typeof AppTopBar>;
type FolderNavigatorProps = ComponentProps<typeof FolderNavigator>;
type WorkspaceRailProps = ComponentProps<typeof WorkspaceRail>;

export type ElectronHomeWorkspaceProps = {
  backupNotice?: WorkspaceBackupNoticeProps | null;
  documentWorkspace: ComponentProps<typeof DocumentWorkspace>;
  navigator: Omit<FolderNavigatorProps, 'id'>;
  navigatorResize: {
    disabled: boolean;
    value: number;
    onChange: (value: number) => void;
  };
  rail: Omit<WorkspaceRailProps, 'id'>;
  railResize: {
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
      railCollapsed: boolean;
    };
    state: Pick<NoteWorkspaceState, 'scopeKey' | 'activePaneId' | 'backStack' | 'forwardStack' | 'panes' | 'recentlyClosedTabs'>;
    actions: {
      moveActiveTabToOtherPane: () => void;
      navigateBack: () => void;
      navigateForward: () => void;
      reopenLastClosedTab: () => void;
      requestCloseOtherTabs: (paneId: string, tabId: string) => Promise<unknown>;
      requestCloseTab: (tabId: string) => Promise<unknown>;
      requestCloseTabsToRight: (paneId: string, tabId: string) => Promise<unknown>;
      selectTab: (paneId: string, tabId: string) => void;
      reorderTab: (paneId: string, tabId: string, overTabId: string) => void;
      splitActiveTab: () => void;
      toggleNavigator: () => void;
      toggleRail: () => void;
    };
  };
};

export function ElectronHomeWorkspace({
  backupNotice,
  documentWorkspace,
  navigator,
  navigatorResize,
  rail,
  railResize,
  titlebar,
}: ElectronHomeWorkspaceProps) {
  const activeTitlebarPane = titlebar.state.panes.find((pane) => pane.paneId === titlebar.state.activePaneId) ?? null;
  const activeTitlebarPaneView = activeTitlebarPane ? titlebar.getPaneView(activeTitlebarPane) : null;
  const activeTitlebarTabs = activeTitlebarPane ? titlebar.getPaneTabs(activeTitlebarPane) : [];

  return (
    <>
      <AppTopBar
        tabStripId={`${titlebar.state.scopeKey}:${activeTitlebarPane?.paneId}`}
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
        onSplitPane={titlebar.actions.splitActiveTab}
        paneActions={{
          canMoveToOtherPane: titlebar.state.panes.length > 1,
          canReopenLastClosedTab: titlebar.state.recentlyClosedTabs.length > 0,
          canSplit: titlebar.state.panes.length < 2,
        }}
        platform={window.hackdeskAPI?.platform ?? 'unknown'}
        navigatorCollapsed={titlebar.layout.navigatorCollapsed}
        navigatorPanelId={NOTE_NAVIGATOR_PANEL_ID}
        railCollapsed={titlebar.layout.railCollapsed}
        railPanelId={WORKSPACE_RAIL_PANEL_ID}
        tabs={activeTitlebarTabs}
        onToggleNavigator={titlebar.actions.toggleNavigator}
        onToggleRail={titlebar.actions.toggleRail}
      />

      {backupNotice ? <WorkspaceBackupNotice {...backupNotice} /> : null}

      <main className="flex min-h-0 min-w-0 flex-1">
        <WorkspaceRail id={WORKSPACE_RAIL_PANEL_ID} {...rail} />
        <PanelResizeSash
          label="Resize workspace sidebar"
          value={railResize.value}
          min={RAIL_WIDTH_MIN}
          max={RAIL_WIDTH_MAX}
          defaultValue={RAIL_WIDTH_DEFAULT}
          disabled={railResize.disabled}
          onChange={railResize.onChange}
        />

        <FolderNavigator id={NOTE_NAVIGATOR_PANEL_ID} {...navigator} />
        <PanelResizeSash
          label="Resize note navigator"
          value={navigatorResize.value}
          min={NAVIGATOR_WIDTH_MIN}
          max={NAVIGATOR_WIDTH_MAX}
          defaultValue={NAVIGATOR_WIDTH_DEFAULT}
          disabled={navigatorResize.disabled}
          onChange={navigatorResize.onChange}
        />

        <DocumentWorkspace {...documentWorkspace} />
      </main>
    </>
  );
}
