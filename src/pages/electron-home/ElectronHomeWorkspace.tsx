import type { ComponentProps } from 'react';
import { useCallback } from 'react';

import { MAX_NOTE_PANES } from '@/lib/electron-actions';

import { cn } from '@/lib/utils';

import {
  AppTopBar,
  TitleBarLeadingSlot,
  PaneTabBar,
  useTrafficLightInset,
  type ApplicationControlsProps,
  type PaneTabBarSegment,
} from './AppTopBar';
import { AltMenuBar, hasCustomWindowChrome, WindowControls } from './WindowChrome';
import { DocumentWorkspace, type DocumentPaneView, type PaneHeaderPlacement } from './DocumentWorkspace';
import { FolderNavigator } from './FolderNavigator';
import type { NoteSummary } from '@/lib/electron-api';

import type { NoteDropTarget, NotePane, NoteWorkspaceState, OpenNoteTab } from './note-workspace';
import { PanelResizeSash } from './PanelResizeSash';
import { layoutPaneIds, type PaneDirection } from './pane-layout';
import { NAVIGATOR_WIDTH_DEFAULT, NAVIGATOR_WIDTH_MAX, NAVIGATOR_WIDTH_MIN, NAVIGATOR_WIDTH_SNAP_KEY } from './ui-preferences';
import { WorkspaceBackupNotice, type WorkspaceBackupNoticeProps } from './WorkspaceBackupNotice';
import { WorkspaceNavigationProvider, type WorkspaceNavigation } from './WorkspaceNavigationContext';
import { WorkbenchDocumentActionsProvider, type WorkbenchDocumentActions } from './DocumentActionsContext';
import { WorkspaceTabDndProvider } from './WorkspaceTabDnd';
import { HACK_MODE_DRAG_STRIP_CLASS, HACK_MODE_HIDDEN_CLASS } from './ui';

export const NOTE_NAVIGATOR_PANEL_ID = 'note-navigator-panel';

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
    getTabSyncState: ComponentProps<typeof PaneTabBar>['getTabSyncState'];
    layout: {
      navigatorCollapsed: boolean;
    };
    state: Pick<NoteWorkspaceState, 'scopeKey' | 'activePaneId' | 'backStack' | 'forwardStack' | 'panes' | 'recentlyClosedTabs' | 'zoomedPaneId'> & {
      layout?: NoteWorkspaceState['layout'];
    };
    actions: {
      moveActiveTabToOtherPane: (paneId?: string) => void;
      moveTabToPane?: (tabId: string, targetPaneId: string, options?: { overTabId?: string; copy?: boolean }) => void;
      /** Opens a note dragged from the sidebar where it was dropped on the panes. */
      openNoteAt?: (note: NoteSummary, target: NoteDropTarget) => void;
      navigateBack: () => void;
      navigateForward: () => void;
      reopenLastClosedTab: () => void;
      requestCloseOtherTabs: (paneId: string, tabId: string) => Promise<unknown>;
      requestCloseTab: (tabId: string) => Promise<unknown>;
      requestCloseTabsToRight: (paneId: string, tabId: string) => Promise<unknown>;
      selectTab: (paneId: string, tabId: string) => void;
      keepTab: (tabId: string) => void;
      reorderTab: (paneId: string, tabId: string, overTabId: string) => void;
      splitActiveTab: (paneId?: string) => void;
      splitActivePaneDown: (paneId?: string) => void;
      splitTabToNewPane?: (tabId: string, target: { paneId?: string; edge?: boolean; direction: PaneDirection }, options?: { copy?: boolean }) => void;
      togglePaneZoom: (paneId?: string) => void;
      equalizePanes: () => void;
      toggleNavigator: () => void;
      onNewTab: (paneId?: string) => void;
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
  const layout = titlebar.state.layout ?? documentWorkspace.layout;
  const orderedPaneIds = layout ? layoutPaneIds(layout) : titlebar.state.panes.map((pane) => pane.paneId);
  const visiblePaneCount = titlebar.state.zoomedPaneId ? 1 : orderedPaneIds.length;
  const platform = window.hackdeskAPI?.platform ?? 'unknown';
  const trafficLightInset = useTrafficLightInset(platform);
  const customChrome = hasCustomWindowChrome(platform);
  const { navigatorCollapsed } = titlebar.layout;
  const applicationControls: ApplicationControlsProps = {
    navigation: {
      canGoBack: titlebar.state.backStack.length > 0,
      canGoForward: titlebar.state.forwardStack.length > 0,
      onBack: titlebar.actions.navigateBack,
      onForward: titlebar.actions.navigateForward,
    },
    navigatorCollapsed,
    navigatorPanelId: NOTE_NAVIGATOR_PANEL_ID,
    onToggleNavigator: titlebar.actions.toggleNavigator,
    appMenu: customChrome,
  };

  const paneSegment = (pane: NotePane): PaneTabBarSegment => {
    const view = titlebar.getPaneView(pane);
    const isActivePane = pane.paneId === titlebar.state.activePaneId;
    return {
      paneId: pane.paneId,
      isActivePane,
      showEqualizeButton: isActivePane,
      activeTab: view?.activeTab ?? null,
      tabs: titlebar.getPaneTabs(pane),
      onCloseOtherTabs: (tabId) => {
        void titlebar.actions.requestCloseOtherTabs(pane.paneId, tabId);
      },
      onCloseTab: (tabId) => {
        void titlebar.actions.requestCloseTab(tabId);
      },
      onCloseTabsToRight: (tabId) => {
        void titlebar.actions.requestCloseTabsToRight(pane.paneId, tabId);
      },
      onMoveTabToOtherPane: () => titlebar.actions.moveActiveTabToOtherPane(pane.paneId),
      onReorderTab: (tabId, overTabId) => {
        titlebar.actions.reorderTab(pane.paneId, tabId, overTabId);
      },
      onSelectTab: (tabId) => {
        titlebar.actions.selectTab(pane.paneId, tabId);
      },
      onKeepTab: titlebar.actions.keepTab,
      onSplitPane: () => titlebar.actions.splitActiveTab(pane.paneId),
      onNewTab: () => titlebar.actions.onNewTab(pane.paneId),
      paneLayout: {
        zoomed: Boolean(titlebar.state.zoomedPaneId),
        onSplitDown: () => titlebar.actions.splitActivePaneDown(pane.paneId),
        onToggleZoom: () => titlebar.actions.togglePaneZoom(pane.paneId),
        onEqualize: titlebar.actions.equalizePanes,
      },
      paneActions: {
        canMoveToOtherPane: titlebar.state.panes.length > 1,
        canReopenLastClosedTab: titlebar.state.recentlyClosedTabs.length > 0,
        canSplit: titlebar.state.panes.length < MAX_NOTE_PANES,
      },
    };
  };

  const renderPaneHeader = (pane: NotePane, placement: PaneHeaderPlacement) => (
    <PaneTabBar
      segment={paneSegment(pane)}
      getTabSyncState={titlebar.getTabSyncState}
      onReopenLastClosedTab={titlebar.actions.reopenLastClosedTab}
      isSegmented={visiblePaneCount > 1}
      topRow={placement.topRow}
      // The sidebar's title bar keeps the application controls; while it is collapsed they overflow it,
      // over the room the top-left pane's tabs make for them.
      leadingSpace={placement.leading}
      leadingOpen={navigatorCollapsed}
      trafficLightInset={trafficLightInset}
      appMenu={customChrome}
      windowControls={customChrome && placement.topRow && placement.trailing}
    />
  );
  // No pane is left to carry a tab bar, but the title bar row stays: it drags the window and keeps room
  // for the controls while the sidebar is collapsed.
  const emptyHeader = (
    <div className={cn(
      'pane-tab-bar app-topbar flex h-10 shrink-0 items-center',
      HACK_MODE_DRAG_STRIP_CLASS,
    )}>
      <TitleBarLeadingSlot open={navigatorCollapsed} trafficLightInset={trafficLightInset} appMenu={customChrome} />
      {customChrome ? <WindowControls className="mr-1 ml-auto" /> : null}
    </div>
  );

  const getTabTitle = useCallback((tabId: string) => {
    for (const pane of titlebar.state.panes) {
      const match = titlebar.getPaneTabs(pane).find((tab) => tab.tabId === tabId);
      if (match) return match.title || 'Untitled';
    }
    return 'Untitled';
  }, [titlebar]);

  return (
    <WorkspaceTabDndProvider
      panes={titlebar.state.panes}
      activePaneId={titlebar.state.activePaneId}
      zoomedPaneId={titlebar.state.zoomedPaneId}
      getTabTitle={getTabTitle}
      onReorderTab={titlebar.actions.reorderTab}
      onMoveTabToPane={titlebar.actions.moveTabToPane}
      onSplitTabToNewPane={titlebar.actions.splitTabToNewPane}
      onDropNote={titlebar.actions.openNoteAt}
    >
      {/* Notes sit on cards a gap in from the window; the sidebar's resize handle is the gap beside it. */}
      {/* The gap left of the card while the sidebar is collapsed is the sidebar's own margin, so it
          grows as the sidebar narrows instead of shoving the sidebar aside the moment it starts. */}
      {customChrome ? <AltMenuBar /> : null}
      <main className="flex min-h-0 min-w-0 flex-1 pr-1.5 pb-1.5 [[data-hack-mode]_&]:p-0">
        {/* The sidebar's column: its own title bar row, then the sidebar. The row takes the sidebar's
            width (also while it animates or is dragged), never setting it. */}
        <div className={cn('flex min-h-0 shrink-0 flex-col [&>aside]:min-h-0 [&>aside]:flex-1', HACK_MODE_HIDDEN_CLASS)}>
          <AppTopBar {...applicationControls} trafficLightInset={trafficLightInset} />
          <WorkspaceNavigationProvider value={workspaceNavigation}>
            <FolderNavigator id={NOTE_NAVIGATOR_PANEL_ID} {...navigator} />
          </WorkspaceNavigationProvider>
        </div>
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
          snapMemoryKey={NAVIGATOR_WIDTH_SNAP_KEY}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Above the panes, so error toasts at the bottom never cover its buttons. With the sidebar
              collapsed it starts at the window's edge, under the traffic lights and the application controls, so it steps past them. */}
          {backupNotice ? (
            <WorkspaceBackupNotice
              {...backupNotice}
              className={cn('my-1.5 rounded-lg border', navigatorCollapsed && (trafficLightInset ? 'ml-45' : customChrome ? 'ml-32' : 'ml-24'))}
            />
          ) : null}
          <WorkbenchDocumentActionsProvider value={documentActions}>
            <DocumentWorkspace {...documentWorkspace} renderPaneHeader={renderPaneHeader} emptyHeader={emptyHeader} />
          </WorkbenchDocumentActionsProvider>
        </div>
      </main>
    </WorkspaceTabDndProvider>
  );
}
