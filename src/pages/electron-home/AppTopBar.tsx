import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';

import { Toolbar, ToolbarSeparator } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';
import { ToolbarIconButton } from './interaction-primitives';
import { DocumentTabs, type PaneLayoutMenuActions } from './DocumentTabs';
import type { DocumentSyncState } from './DocumentDetail';
import type { ElectronActionId } from '@/lib/electron-api';
import type { OpenNoteTab } from './note-workspace';
import { HACK_MODE_DRAG_STRIP_CLASS } from './ui';

export type AppTopBarTabSegment = {
  paneId?: string;
  tabStripId?: string;
  isActivePane?: boolean;
  showEqualizeButton?: boolean;
  activeTab: OpenNoteTab | null;
  tabs: OpenNoteTab[];
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onMoveTabToOtherPane: () => void;
  onReorderTab: (tabId: string, overTabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onKeepTab?: (tabId: string) => void;
  onSplitPane: () => void;
  onNewTab: () => void;
  paneLayout: PaneLayoutMenuActions;
  paneActions: {
    canMoveToOtherPane: boolean;
    canReopenLastClosedTab: boolean;
    canSplit: boolean;
  };
};

const noop = () => {};
const DEFAULT_PANE_LAYOUT: PaneLayoutMenuActions = {
  zoomed: false,
  onSplitDown: noop,
  onToggleZoom: noop,
  onEqualize: noop,
};
const DEFAULT_PANE_ACTIONS = {
  canMoveToOtherPane: false,
  canReopenLastClosedTab: false,
  canSplit: false,
};

function TopBarIconButton({
  actionId,
  children,
  controls,
  expanded,
  label,
  onClick,
  disabled,
  tooltip,
}: {
  actionId: ElectronActionId;
  children: ReactNode;
  controls?: string;
  disabled?: boolean;
  expanded?: boolean;
  label: string;
  onClick: () => void;
  tooltip?: ReactNode;
}) {
  return (
    <ToolbarIconButton
      actionId={actionId}
      onClick={onClick}
      aria-controls={controls}
      aria-expanded={expanded}
      disabled={disabled}
      label={label}
      tooltip={tooltip}
      className="app-topbar-button app-region-no-drag h-7 w-7 rounded-md"
    >
      {children}
    </ToolbarIconButton>
  );
}

export function AppTopBar({
  activeTab,
  tabStripId,
  paneId,
  segments,
  getTabSyncState,
  navigation,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToRight,
  onMoveTabToOtherPane,
  onReopenLastClosedTab,
  onReorderTab,
  onSelectTab,
  onKeepTab,
  onSplitPane,
  paneLayout,
  paneActions,
  platform,
  navigatorCollapsed,
  navigatorPanelId,
  tabs,
  onToggleNavigator,
  onNewTab,
}: {
  activeTab?: OpenNoteTab | null;
  tabStripId?: string;
  paneId?: string;
  segments?: AppTopBarTabSegment[];
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  navigation: {
    canGoBack: boolean;
    canGoForward: boolean;
    onBack: () => void;
    onForward: () => void;
  };
  onCloseOtherTabs?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onCloseTabsToRight?: (tabId: string) => void;
  onMoveTabToOtherPane?: () => void;
  onReopenLastClosedTab: () => void;
  onReorderTab?: (tabId: string, overTabId: string) => void;
  onSelectTab?: (tabId: string) => void;
  /** Keeps a preview tab open. */
  onKeepTab?: (tabId: string) => void;
  onSplitPane?: () => void;
  paneLayout?: PaneLayoutMenuActions;
  paneActions?: {
    canMoveToOtherPane: boolean;
    canReopenLastClosedTab: boolean;
    canSplit: boolean;
  };
  platform: string;
  navigatorCollapsed: boolean;
  navigatorPanelId: string;
  tabs?: OpenNoteTab[];
  onToggleNavigator: () => void;
  onNewTab?: () => void;
}) {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    const appApi = window.hackdeskAPI?.app;
    if (platform !== 'darwin'
      || !appApi?.getWindowPresentationState
      || !appApi.onWindowPresentationStateChange) {
      return;
    }

    let active = true;
    let receivedPresentationEvent = false;
    void appApi.getWindowPresentationState().then((state) => {
      if (active && !receivedPresentationEvent) {
        setFullScreen(state.fullScreen);
      }
    });
    const unsubscribe = appApi.onWindowPresentationStateChange((state) => {
      receivedPresentationEvent = true;
      setFullScreen(state.fullScreen);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [platform]);

  const resolvedSegments: AppTopBarTabSegment[] = segments && segments.length > 0
    ? segments
    : [{
      paneId,
      tabStripId,
      isActivePane: true,
      showEqualizeButton: paneActions?.canMoveToOtherPane ?? false,
      activeTab: activeTab ?? null,
      tabs: tabs ?? [],
      onCloseOtherTabs: onCloseOtherTabs ?? noop,
      onCloseTab: onCloseTab ?? noop,
      onCloseTabsToRight: onCloseTabsToRight ?? noop,
      onMoveTabToOtherPane: onMoveTabToOtherPane ?? noop,
      onReorderTab: onReorderTab ?? noop,
      onSelectTab: onSelectTab ?? noop,
      onKeepTab,
      onSplitPane: onSplitPane ?? noop,
      onNewTab: onNewTab ?? noop,
      paneLayout: paneLayout ?? DEFAULT_PANE_LAYOUT,
      paneActions: paneActions ?? DEFAULT_PANE_ACTIONS,
    }];
  const isSegmented = resolvedSegments.length > 1;

  return (
    <header className={cn(
      'app-topbar flex h-10 shrink-0 items-center gap-2 pr-2',
      HACK_MODE_DRAG_STRIP_CLASS,
      platform === 'darwin' && !fullScreen ? 'pl-21.5' : 'pl-2',
    )}>
      <Toolbar aria-label="Application controls" className="shrink-0">
        <TopBarIconButton
          actionId="toggle-navigator"
          controls={navigatorPanelId}
          expanded={!navigatorCollapsed}
          label={navigatorCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleNavigator}
        >
          {navigatorCollapsed ? <PanelLeftOpen aria-hidden="true" className="size-4.5" /> : <PanelLeftClose aria-hidden="true" className="size-4.5" />}
        </TopBarIconButton>
        <ToolbarSeparator />
        <TopBarIconButton
          actionId="navigate-back"
          disabled={!navigation.canGoBack}
          label="Back"
          tooltip={navigation.canGoBack ? 'Back' : 'No previous note location'}
          onClick={navigation.onBack}
        >
          <ArrowLeft aria-hidden="true" className="size-4.5" />
        </TopBarIconButton>
        <TopBarIconButton
          actionId="navigate-forward"
          disabled={!navigation.canGoForward}
          label="Forward"
          tooltip={navigation.canGoForward ? 'Forward' : 'No next note location'}
          onClick={navigation.onForward}
        >
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </TopBarIconButton>
      </Toolbar>
      <div className="flex h-full min-w-0 flex-1 items-center gap-1.5">
        {resolvedSegments.map((segment, index) => (
          <Fragment key={segment.tabStripId ?? segment.paneId ?? index}>
            {index > 0 ? (
              <div
                aria-hidden="true"
                data-tab-segment-divider=""
                className="h-5 w-px shrink-0 bg-border-default"
              />
            ) : null}
            <DocumentTabs
              paneId={segment.paneId}
              isActivePane={segment.isActivePane ?? true}
              isSegmented={isSegmented}
              showEqualizeButton={segment.showEqualizeButton ?? (segment.isActivePane ?? true)}
              activeTab={segment.activeTab}
              canMoveToOtherPane={segment.paneActions.canMoveToOtherPane}
              canReopenLastClosedTab={segment.paneActions.canReopenLastClosedTab}
              canSplit={segment.paneActions.canSplit}
              className="h-full"
              getTabSyncState={getTabSyncState}
              onCloseOtherTabs={segment.onCloseOtherTabs}
              onCloseTab={segment.onCloseTab}
              onCloseTabsToRight={segment.onCloseTabsToRight}
              onMoveTabToOtherPane={segment.onMoveTabToOtherPane}
              onReopenLastClosedTab={onReopenLastClosedTab}
              onReorderTab={segment.onReorderTab}
              onSelectTab={segment.onSelectTab}
              onKeepTab={segment.onKeepTab}
              onSplitPane={segment.onSplitPane}
              paneLayout={segment.paneLayout}
              onNewTab={segment.onNewTab}
              tabs={segment.tabs}
            />
          </Fragment>
        ))}
      </div>
    </header>
  );
}
