import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Toolbar, ToolbarSeparator } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';
import { ToolbarIconButton } from './interaction-primitives';
import { DocumentTabs, type PaneLayoutMenuActions } from './DocumentTabs';
import type { DocumentSyncState } from './DocumentDetail';
import type { ElectronActionId } from '@/lib/electron-api';
import type { OpenNoteTab } from './note-workspace';
import { HACK_MODE_DRAG_STRIP_CLASS } from './ui';

/** One pane's tabs and the actions its tab bar runs. */
export type PaneTabBarSegment = {
  paneId: string;
  isActivePane: boolean;
  showEqualizeButton: boolean;
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

export type ApplicationControlsProps = {
  navigation: {
    canGoBack: boolean;
    canGoForward: boolean;
    onBack: () => void;
    onForward: () => void;
  };
  navigatorCollapsed: boolean;
  navigatorPanelId: string;
  onToggleNavigator: () => void;
};

/**
 * Whether the window's leading edge holds the macOS traffic lights, which the first title bar row
 * must leave room for. A fullscreen window has none.
 */
export function useTrafficLightInset(platform: string) {
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

  return platform === 'darwin' && !fullScreen;
}

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

/** The sidebar toggle and note history buttons: the window's own controls, not any pane's. */
export function ApplicationControls({
  navigation,
  navigatorCollapsed,
  navigatorPanelId,
  onToggleNavigator,
}: ApplicationControlsProps) {
  return (
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
  );
}

/**
 * The sidebar's title bar: the traffic lights and the application controls, as wide as the sidebar.
 * The panes beside it carry their own tab bars, so a split never has to share one strip of tabs.
 * While the sidebar is collapsed the controls move to the top-left pane's tab bar, and this row
 * stays empty (it is clipped to nothing anyway).
 */
export function AppTopBar({
  trafficLightInset,
  ...controls
}: ApplicationControlsProps & { trafficLightInset: boolean }) {
  return (
    // No width of its own (w-0, padding inside): the column is as wide as the sidebar below, down to nothing.
    <header className={cn('app-topbar h-10 w-0 min-w-full shrink-0 overflow-hidden', HACK_MODE_DRAG_STRIP_CLASS)}>
      <div className={cn('flex h-full items-center gap-2 pr-2', trafficLightInset ? 'pl-21.5' : 'pl-2')}>
        {controls.navigatorCollapsed ? null : <ApplicationControls {...controls} />}
      </div>
    </header>
  );
}

/**
 * A pane's own tab bar, above its card. Bars along the top edge are part of the window's title bar
 * (they drag the window and line up with the sidebar's); the ones lower down are a little shorter.
 */
export function PaneTabBar({
  segment,
  getTabSyncState,
  onReopenLastClosedTab,
  isSegmented,
  topRow,
  leading,
  trafficLightInset = false,
}: {
  segment: PaneTabBarSegment;
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  onReopenLastClosedTab: () => void;
  /** More than one pane is showing, so each bar's tabs are narrower and the inactive ones dim. */
  isSegmented: boolean;
  topRow: boolean;
  /** The application controls, when the sidebar that normally holds them is collapsed. */
  leading?: ReactNode;
  trafficLightInset?: boolean;
}) {
  return (
    <div
      data-pane-tab-bar={segment.paneId}
      data-pane-tab-bar-row={topRow ? 'top' : 'inner'}
      className={cn(
        // pr-1: the panel clips at the card's edge, which would cut off the last button's focus ring.
        'pane-tab-bar flex min-w-0 shrink-0 items-center gap-2 pr-1',
        topRow ? 'app-topbar h-10' : 'h-9 [&_[data-tab-id]]:h-7',
        HACK_MODE_DRAG_STRIP_CLASS,
        leading && trafficLightInset ? 'pl-20' : 'pl-0.5',
      )}
    >
      {leading}
      <DocumentTabs
        paneId={segment.paneId}
        isActivePane={segment.isActivePane}
        isSegmented={isSegmented}
        showEqualizeButton={segment.showEqualizeButton}
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
    </div>
  );
}
