import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Toolbar, ToolbarGroup } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';
import { ToolbarIconButton } from './interaction-primitives';
import { DocumentTabs, type PaneLayoutMenuActions } from './DocumentTabs';
import type { DocumentSyncState } from './DocumentDetail';
import type { ElectronActionId } from '@/lib/electron-api';
import type { OpenNoteTab } from './note-workspace';
import { HACK_MODE_DRAG_STRIP_CLASS, PANEL_MOTION_CLASS } from './ui';

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

const FADE_CLASS = 'transition-opacity duration-200 ease-out motion-reduce:transition-none';

function hiddenProps(hidden: boolean) {
  return { 'aria-hidden': hidden ? true : undefined, ...({ inert: hidden ? '' : undefined } as Record<string, string | undefined>) };
}

function NoteHistoryButtons({ navigation }: Pick<ApplicationControlsProps, 'navigation'>) {
  return (
    <>
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
    </>
  );
}

/**
 * The sidebar toggle and note history buttons: the window's own controls, not any pane's. The
 * toggle sits beside the traffic lights and never moves, collapsed or not. The history buttons sit at
 * the sidebar's end, move with its edge and fade out as it collapses; the top-left pane's tab bar
 * then fades in its own (CollapsedSidebarControls).
 */
export function ApplicationControls({
  navigation,
  navigatorCollapsed,
  navigatorPanelId,
  onToggleNavigator,
}: ApplicationControlsProps) {
  return (
    <Toolbar aria-label="Application controls" className="min-w-0 flex-1">
      <TopBarIconButton
        actionId="toggle-navigator"
        controls={navigatorPanelId}
        expanded={!navigatorCollapsed}
        label={navigatorCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={onToggleNavigator}
      >
        {navigatorCollapsed ? <PanelLeftOpen aria-hidden="true" className="size-4.5" /> : <PanelLeftClose aria-hidden="true" className="size-4.5" />}
      </TopBarIconButton>
      {/* Clips the history buttons as the sidebar narrows past them; its padding (cancelled by the
          negative margin) leaves room for their focus rings. */}
      <div className="-m-1 flex min-w-0 flex-1 justify-end overflow-hidden p-1">
        <ToolbarGroup
          aria-label="Note history"
          {...hiddenProps(navigatorCollapsed)}
          className={cn('shrink-0', FADE_CLASS, navigatorCollapsed && 'opacity-0')}
        >
          <NoteHistoryButtons navigation={navigation} />
        </ToolbarGroup>
      </div>
    </Toolbar>
  );
}

/**
 * The sidebar's title bar: the traffic lights and the application controls, as wide as the sidebar.
 * The panes beside it carry their own tab bars, so a split never has to share one strip of tabs.
 * It does not clip: while the sidebar is collapsed (the row is then no wide at all) the sidebar
 * toggle stays where it was, over the space the top-left pane's tab bar keeps free for it.
 */
export function AppTopBar({
  trafficLightInset,
  ...controls
}: ApplicationControlsProps & { trafficLightInset: boolean }) {
  return (
    // No width of its own (w-0, padding inside): the column is as wide as the sidebar below, down to nothing.
    // z-10: the toggle, overflowing a collapsed column, paints and takes clicks above the pane's tab bar.
    <header className={cn('app-topbar relative z-10 h-10 w-0 min-w-full shrink-0', HACK_MODE_DRAG_STRIP_CLASS)}>
      <div className={cn('flex h-full items-center gap-2 pr-2', trafficLightInset ? 'pl-21.5' : 'pl-2')}>
        <ApplicationControls {...controls} />
      </div>
    </header>
  );
}

/**
 * What the top-left pane's tab bar holds while the sidebar is collapsed: room for the sidebar toggle,
 * which stays in the sidebar's title bar, then the note history buttons.
 */
export function CollapsedSidebarControls({ navigation }: Pick<ApplicationControlsProps, 'navigation'>) {
  return (
    <div className="flex items-center gap-1">
      {/* The toggle lies over this; no-drag, so the window does not drag from under it. */}
      <span aria-hidden="true" className="app-region-no-drag size-7 shrink-0" />
      <Toolbar aria-label="Note history">
        <NoteHistoryButtons navigation={navigation} />
      </Toolbar>
    </div>
  );
}

/**
 * The start of the top-left title bar row, holding CollapsedSidebarControls while the sidebar is
 * collapsed. It opens and closes with the sidebar's own width animation, so the tabs after it glide
 * along with the card instead of jumping when the sidebar starts to move, and its content fades. A
 * closed slot stays mounted (inert, hidden) for its closing animation. The middle wrapper carries no
 * padding, so `0fr` really closes it to nothing. Its left padding puts the space it keeps for the
 * sidebar toggle exactly under it.
 */
export function TitleBarLeadingSlot({
  open,
  trafficLightInset,
  children,
}: {
  open: boolean;
  trafficLightInset: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-title-bar-leading={open ? 'open' : 'closed'}
      {...hiddenProps(!open)}
      // Its column (0fr closed, 1fr open) is set in styles.css, keyed on data-title-bar-leading.
      className={cn('grid shrink-0', PANEL_MOTION_CLASS)}
    >
      <div className="min-w-0 overflow-hidden">
        <div className={cn('flex w-max items-center pr-2', trafficLightInset ? 'pl-20' : 'pl-0.5', FADE_CLASS, !open && 'opacity-0')}>
          {children}
        </div>
      </div>
    </div>
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
  leadingOpen = false,
  trafficLightInset = false,
}: {
  segment: PaneTabBarSegment;
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  onReopenLastClosedTab: () => void;
  /** More than one pane is showing, so each bar's tabs are narrower and the inactive ones dim. */
  isSegmented: boolean;
  topRow: boolean;
  /** CollapsedSidebarControls, on the top-left pane; shown while the sidebar is collapsed. */
  leading?: ReactNode;
  leadingOpen?: boolean;
  trafficLightInset?: boolean;
}) {
  return (
    <div
      data-pane-tab-bar={segment.paneId}
      data-pane-tab-bar-row={topRow ? 'top' : 'inner'}
      className={cn(
        // pr-1: the panel clips at the card's edge, which would cut off the last button's focus ring.
        'pane-tab-bar flex min-w-0 shrink-0 items-center pr-1',
        topRow ? 'app-topbar h-10' : 'h-9 [&_[data-tab-id]]:h-7',
        HACK_MODE_DRAG_STRIP_CLASS,
      )}
    >
      {leading ? <TitleBarLeadingSlot open={leadingOpen} trafficLightInset={trafficLightInset}>{leading}</TitleBarLeadingSlot> : null}
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
