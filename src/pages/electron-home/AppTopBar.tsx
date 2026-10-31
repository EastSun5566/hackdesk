import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Toolbar, ToolbarSeparator } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';
import { ToolbarIconButton } from './interaction-primitives';
import { DocumentTabs } from './DocumentTabs';
import type { DocumentSyncState } from './DocumentDetail';
import type { ElectronActionId } from '@/lib/electron-api';
import type { OpenNoteTab } from './note-workspace';
import { HACK_MODE_DRAG_STRIP_CLASS } from './ui';

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
  getTabSyncState,
  navigation,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToRight,
  onMoveTabToOtherPane,
  onReopenLastClosedTab,
  onReorderTab,
  onSelectTab,
  onSplitPane,
  paneActions,
  platform,
  navigatorCollapsed,
  navigatorPanelId,
  tabs,
  onToggleNavigator,
}: {
  activeTab: OpenNoteTab | null;
  tabStripId?: string;
  paneId?: string;
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  navigation: {
    canGoBack: boolean;
    canGoForward: boolean;
    onBack: () => void;
    onForward: () => void;
  };
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onMoveTabToOtherPane: () => void;
  onReopenLastClosedTab: () => void;
  onReorderTab: (tabId: string, overTabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onSplitPane: () => void;
  paneActions: {
    canMoveToOtherPane: boolean;
    canReopenLastClosedTab: boolean;
    canSplit: boolean;
  };
  platform: string;
  navigatorCollapsed: boolean;
  navigatorPanelId: string;
  tabs: OpenNoteTab[];
  onToggleNavigator: () => void;
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

  return (
    <header className={cn(
      'app-topbar flex h-10 shrink-0 items-center gap-2 border-b border-border-default bg-background-default pr-2',
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
      <DocumentTabs
        key={tabStripId}
        paneId={paneId}
        activeTab={activeTab}
        canMoveToOtherPane={paneActions.canMoveToOtherPane}
        canReopenLastClosedTab={paneActions.canReopenLastClosedTab}
        canSplit={paneActions.canSplit}
        className="h-full"
        getTabSyncState={getTabSyncState}
        onCloseOtherTabs={onCloseOtherTabs}
        onCloseTab={onCloseTab}
        onCloseTabsToRight={onCloseTabsToRight}
        onMoveTabToOtherPane={onMoveTabToOtherPane}
        onReopenLastClosedTab={onReopenLastClosedTab}
        onReorderTab={onReorderTab}
        onSelectTab={onSelectTab}
        onSplitPane={onSplitPane}
        tabs={tabs}
      />
    </header>
  );
}
