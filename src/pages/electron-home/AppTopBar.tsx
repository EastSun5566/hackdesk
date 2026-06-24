import { FolderTree, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';

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
}: {
  actionId: ElectronActionId;
  children: ReactNode;
  controls?: string;
  expanded?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <ToolbarIconButton
      actionId={actionId}
      onClick={onClick}
      aria-controls={controls}
      aria-expanded={expanded}
      label={label}
      className="app-topbar-button app-region-no-drag h-7 w-7 rounded-[6px]"
    >
      {children}
    </ToolbarIconButton>
  );
}

export function AppTopBar({
  activeTab,
  canMoveToOtherPane,
  canReopenLastClosedTab,
  canSplit,
  getTabSyncState,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToRight,
  onMoveTabToOtherPane,
  onReopenLastClosedTab,
  onSelectTab,
  onSplitPane,
  navigatorCollapsed,
  navigatorPanelId,
  railCollapsed,
  railPanelId,
  tabs,
  onToggleNavigator,
  onToggleRail,
}: {
  activeTab: OpenNoteTab | null;
  canMoveToOtherPane: boolean;
  canReopenLastClosedTab: boolean;
  canSplit: boolean;
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onMoveTabToOtherPane: () => void;
  onReopenLastClosedTab: () => void;
  onSelectTab: (tabId: string) => void;
  onSplitPane: () => void;
  navigatorCollapsed: boolean;
  navigatorPanelId: string;
  railCollapsed: boolean;
  railPanelId: string;
  tabs: OpenNoteTab[];
  onToggleNavigator: () => void;
  onToggleRail: () => void;
}) {
  return (
    <header className="app-topbar flex h-10 shrink-0 items-center gap-2 border-b border-border-default bg-background-default pl-[86px] pr-2">
      <div className="flex shrink-0 items-center gap-1">
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
      </div>
      <DocumentTabs
        activeTab={activeTab}
        canMoveToOtherPane={canMoveToOtherPane}
        canReopenLastClosedTab={canReopenLastClosedTab}
        canSplit={canSplit}
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
