import { ArrowLeft, ArrowRight, FolderTree, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import { Toolbar, ToolbarSeparator } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';
import { ToolbarIconButton } from './interaction-primitives';
import { DocumentTabs } from './DocumentTabs';
import type { DocumentSyncState } from './DocumentDetail';
import type { ElectronActionId } from '@/lib/electron-api';
import type { OpenNoteTab } from './note-workspace';

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
      className="app-topbar-button app-region-no-drag h-7 w-7 rounded-[6px]"
    >
      {children}
    </ToolbarIconButton>
  );
}

export function AppTopBar({
  activeTab,
  getTabSyncState,
  navigation,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToRight,
  onMoveTabToOtherPane,
  onReopenLastClosedTab,
  onSelectTab,
  onSplitPane,
  paneActions,
  platform,
  navigatorCollapsed,
  navigatorPanelId,
  railCollapsed,
  railPanelId,
  tabs,
  onToggleNavigator,
  onToggleRail,
}: {
  activeTab: OpenNoteTab | null;
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
  railCollapsed: boolean;
  railPanelId: string;
  tabs: OpenNoteTab[];
  onToggleNavigator: () => void;
  onToggleRail: () => void;
}) {
  return (
    <header className={cn(
      'app-topbar flex h-10 shrink-0 items-center gap-2 border-b border-border-default bg-background-default pr-2',
      platform === 'darwin' ? 'pl-[86px]' : 'pl-2',
    )}>
      <Toolbar aria-label="Application controls" className="shrink-0">
        <TopBarIconButton
          actionId="toggle-workspace-rail"
          controls={railPanelId}
          expanded={!railCollapsed}
          label={railCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
          onClick={onToggleRail}
        >
          {railCollapsed ? <PanelLeftOpen aria-hidden="true" className="h-[18px] w-[18px]" /> : <PanelLeftClose aria-hidden="true" className="h-[18px] w-[18px]" />}
        </TopBarIconButton>
        <TopBarIconButton
          actionId="toggle-navigator"
          controls={navigatorPanelId}
          expanded={!navigatorCollapsed}
          label={navigatorCollapsed ? 'Expand note navigator' : 'Collapse note navigator'}
          onClick={onToggleNavigator}
        >
          <FolderTree aria-hidden="true" className="h-[18px] w-[18px]" />
        </TopBarIconButton>
        <ToolbarSeparator />
        <TopBarIconButton
          actionId="navigate-back"
          disabled={!navigation.canGoBack}
          label="Back"
          tooltip={navigation.canGoBack ? 'Back' : 'No previous note location'}
          onClick={navigation.onBack}
        >
          <ArrowLeft aria-hidden="true" className="h-[18px] w-[18px]" />
        </TopBarIconButton>
        <TopBarIconButton
          actionId="navigate-forward"
          disabled={!navigation.canGoForward}
          label="Forward"
          tooltip={navigation.canGoForward ? 'Forward' : 'No next note location'}
          onClick={navigation.onForward}
        >
          <ArrowRight aria-hidden="true" className="h-[18px] w-[18px]" />
        </TopBarIconButton>
      </Toolbar>
      <DocumentTabs
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
        onSelectTab={onSelectTab}
        onSplitPane={onSplitPane}
        tabs={tabs}
      />
    </header>
  );
}
