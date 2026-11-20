import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import { Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';
import { ToolbarIconButton } from './interaction-primitives';
import { DocumentTabs, type PaneLayoutMenuActions } from './DocumentTabs';
import type { DocumentSyncState } from './DocumentDetail';
import type { ElectronActionId } from '@/lib/electron-api';
import type { OpenNoteTab } from './note-workspace';
import { HACK_MODE_DRAG_STRIP_CLASS, PANEL_MOTION_CLASS } from './ui';
import { ALT_MENU_BAR_COVERED_CLASS, AppMenuButton, useWindowPresentationState, WindowControls } from './WindowChrome';

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
  /** Linux and Windows: the app menu button leads the row, where macOS has its traffic lights. */
  appMenu?: boolean;
};

/**
 * Whether the window's leading edge holds the macOS traffic lights, which the first title bar row
 * must leave room for. A fullscreen window has none.
 */
export function useTrafficLightInset(platform: string) {
  const { fullScreen } = useWindowPresentationState(platform === 'darwin');
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
      variant="icon-topbar"
      className="app-topbar-button app-region-no-drag h-7 w-7 shrink-0"
    >
      {children}
    </ToolbarIconButton>
  );
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
 * The sidebar toggle and note history buttons: the window's own controls, not any pane's. Both stay
 * in the sidebar's title bar, collapsed or not. The toggle sits beside the traffic lights and never
 * moves. The history buttons sit at the sidebar's end and ride its edge as it narrows, until they
 * meet the toggle; there they stay while it is collapsed (over TitleBarLeadingSlot's space), set off
 * from the toggle by a divider. The divider always holds its place just before the history buttons, so
 * it rides the edge with them and never shifts them; it only fades in once they have settled beside the
 * toggle, and fades out quickly as the sidebar starts to open.
 */
export function ApplicationControls({
  navigation,
  navigatorCollapsed,
  navigatorPanelId,
  onToggleNavigator,
  appMenu = false,
}: ApplicationControlsProps) {
  return (
    <Toolbar aria-label="Application controls" className="min-w-fit flex-1">
      {appMenu ? <AppMenuButton /> : null}
      {/* Hidden, with the history buttons, while the Alt menu bar lies over them. */}
      <span className={cn('flex', ALT_MENU_BAR_COVERED_CLASS)}>
        <TopBarIconButton
          actionId="toggle-navigator"
          controls={navigatorPanelId}
          expanded={!navigatorCollapsed}
          label={navigatorCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleNavigator}
        >
          {navigatorCollapsed ? <PanelLeftOpen aria-hidden="true" className="size-4.5" /> : <PanelLeftClose aria-hidden="true" className="size-4.5" />}
        </TopBarIconButton>
      </span>
      {/* Takes the rest of the row and pushes the divider and history buttons to its end, but never
          less than their width, so a narrower row leaves them beside the toggle. gap-1 matches the
          toolbar's own gap, so the divider sits 8px from the toggle and from Back. */}
      <div className={cn('flex min-w-fit flex-1 items-center justify-end gap-1', ALT_MENU_BAR_COVERED_CLASS)}>
        {/* Shown only while collapsed: it fades in once the history buttons have settled beside the
            toggle, and is gone before they move away again. */}
        <ToolbarSeparator shown={navigatorCollapsed} />
        <ToolbarGroup aria-label="Note history">
          <NoteHistoryButtons navigation={navigation} />
        </ToolbarGroup>
      </div>
    </Toolbar>
  );
}

/**
 * The sidebar's title bar: the traffic lights and the application controls, as wide as the sidebar.
 * The panes beside it carry their own tab bars, so a split never has to share one strip of tabs.
 * It does not clip: while the sidebar is collapsed (the row then has no width at all) its controls
 * overflow it, over the space the top-left pane's tab bar keeps free for them.
 */
export function AppTopBar({
  trafficLightInset,
  ...controls
}: ApplicationControlsProps & { trafficLightInset: boolean }) {
  return (
    // No width of its own (w-0, padding inside): the column is as wide as the sidebar below, down to nothing.
    // z-10: the controls, overflowing a collapsed column, paint and take clicks above the pane's tab bar.
    <header className={cn('app-topbar relative z-10 h-10 w-0 min-w-full shrink-0', HACK_MODE_DRAG_STRIP_CLASS)}>
      <div className={cn('flex h-full items-center gap-2 pr-2', trafficLightInset ? 'pl-21.5' : 'pl-2')}>
        <ApplicationControls {...controls} />
      </div>
    </header>
  );
}

/**
 * The start of the top-left title bar row. While the sidebar is collapsed it keeps room for the
 * application controls, which stay in the sidebar's title bar and lie over it. It opens and closes
 * with the sidebar's own width animation, so the tabs after it glide along with the card instead of
 * jumping when the sidebar starts to move. Its left padding puts the space exactly under the
 * controls; the middle wrapper carries no padding, so `0fr` really closes it to nothing.
 */
export function TitleBarLeadingSlot({
  open,
  trafficLightInset,
  appMenu = false,
}: {
  open: boolean;
  trafficLightInset: boolean;
  appMenu?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      data-title-bar-leading={open ? 'open' : 'closed'}
      // Its column (0fr closed, 1fr open) is set in styles.css, keyed on data-title-bar-leading.
      className={cn('grid shrink-0', PANEL_MOTION_CLASS)}
    >
      <div className="min-w-0 overflow-hidden">
        <div className={cn('flex w-max pr-2', trafficLightInset ? 'pl-20' : 'pl-0.5')}>
          {/* The toggle, a gap, the divider with its margins, a gap and two history buttons
              (28 + 4 + 9 + 4 + 28 + 4 + 28 = 105px), after the app menu button and a gap (32px) on
              Linux and Windows. No-drag, so the window does not drag from under the controls. */}
          <span className={cn('app-region-no-drag h-7', appMenu ? 'w-34.25' : 'w-26.25')} />
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
  leadingSpace = false,
  leadingOpen = false,
  trafficLightInset = false,
  appMenu = false,
  windowControls = false,
}: {
  segment: PaneTabBarSegment;
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  onReopenLastClosedTab: () => void;
  /** More than one pane is showing, so each bar's tabs are narrower and the inactive ones dim. */
  isSegmented: boolean;
  topRow: boolean;
  /** The top-left pane: its bar keeps room for the application controls while the sidebar is collapsed. */
  leadingSpace?: boolean;
  leadingOpen?: boolean;
  trafficLightInset?: boolean;
  /** Linux and Windows: the app menu button leads the sidebar's title bar, so the leading space is wider. */
  appMenu?: boolean;
  /** Linux and Windows: the top-right pane's bar ends with the window controls. */
  windowControls?: boolean;
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
      {leadingSpace ? <TitleBarLeadingSlot open={leadingOpen} trafficLightInset={trafficLightInset} appMenu={appMenu} /> : null}
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
      {windowControls ? <WindowControls /> : null}
    </div>
  );
}
