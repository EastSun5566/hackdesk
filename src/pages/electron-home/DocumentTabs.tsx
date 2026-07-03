import { ArrowLeftRight, Columns2, FileText, MoreHorizontal, X } from 'lucide-react';

import { Toolbar } from '@/components/ui/toolbar';
import { Tooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type { OpenNoteTab } from './note-workspace';
import { ToolbarDropdownIconTrigger } from './interaction-primitives';
import { DOCUMENT_SYNC_STATE_LABELS, type DocumentSyncState } from './document-sync-state';

function TabStatusIndicator({ state }: { state: DocumentSyncState }) {
  const label = DOCUMENT_SYNC_STATE_LABELS[state];

  return (
    <Tooltip content={label}>
      <span
        aria-label={label}
        data-sync-state={state}
        className={cn(
          'relative size-2.5 shrink-0 rounded-full border before:pointer-events-none after:pointer-events-none',
          state === 'idle'
          && "border-warning-default bg-warning-soft before:absolute before:left-1/2 before:top-1/2 before:size-1 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-warning-default before:content-['']",
          state === 'loading'
          && "border-text-subtle bg-background-default before:absolute before:inset-[2px] before:rounded-full before:border before:border-text-subtle before:content-['']",
          state === 'cached'
          && "border-primary-default bg-primary-soft before:absolute before:left-1/2 before:top-1/2 before:h-px before:w-1.5 before:-translate-x-1/2 before:-translate-y-1/2 before:bg-primary-default before:content-['']",
          state === 'saving'
          && "border-primary-default bg-primary-soft before:absolute before:left-1/2 before:top-1/2 before:size-1 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-primary-default before:content-[''] after:absolute after:inset-[-2px] after:rounded-full after:border after:border-primary-default/40 after:content-['']",
          state === 'saved' && 'border-success-default bg-success-default',
          (state === 'save_failed' || state === 'conflict')
          && "border-destructive-default bg-destructive-soft before:absolute before:left-1/2 before:top-1/2 before:h-px before:w-1.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:bg-destructive-default before:content-[''] after:absolute after:left-1/2 after:top-1/2 after:h-px after:w-1.5 after:-translate-x-1/2 after:-translate-y-1/2 after:-rotate-45 after:bg-destructive-default after:content-['']",
        )}
      />
    </Tooltip>
  );
}

function DocumentTab({
  tab,
  selected,
  syncState,
  onSelect,
  onClose,
}: {
  tab: OpenNoteTab;
  selected: boolean;
  syncState: DocumentSyncState;
  onSelect: () => void;
  onClose: () => void;
}) {
  const title = tab.title || 'Untitled';

  return (
    <div
      className={cn(
        'group/tab app-region-no-drag flex h-8 min-w-0 max-w-56 items-center gap-2 rounded-[6px] border px-2 text-sm transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none',
        selected
          ? 'border-border-default bg-background-default text-text-default shadow-sm'
          : 'border-transparent bg-transparent text-text-subtle hover:bg-element-bg-hover hover:text-text-default',
      )}
    >
      <button
        type="button"
        className="app-region-no-drag flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        onClick={onSelect}
        aria-current={selected ? 'page' : undefined}
        aria-label={`Select ${title} tab`}
      >
        <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{title}</span>
        <TabStatusIndicator state={syncState} />
      </button>
      <button
        type="button"
        className="app-region-no-drag grid h-5 w-5 shrink-0 place-items-center rounded-[4px] text-text-subtle opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-background-selected hover:text-text-default focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring group-hover/tab:opacity-100 motion-reduce:transition-none"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label={`Close ${title}`}
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function DocumentTabs({
  activeTab,
  canMoveToOtherPane,
  canReopenLastClosedTab,
  canSplit,
  className,
  getTabSyncState,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToRight,
  onMoveTabToOtherPane,
  onReopenLastClosedTab,
  onSelectTab,
  onSplitPane,
  tabs,
}: {
  activeTab: OpenNoteTab | null;
  canMoveToOtherPane: boolean;
  canReopenLastClosedTab: boolean;
  canSplit: boolean;
  className?: string;
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onMoveTabToOtherPane: () => void;
  onReopenLastClosedTab: () => void;
  onSelectTab: (tabId: string) => void;
  onSplitPane: () => void;
  tabs: OpenNoteTab[];
}) {
  const activeTabIndex = activeTab ? tabs.findIndex((tab) => tab.tabId === activeTab.tabId) : -1;
  const hasTabsToRight = activeTabIndex >= 0 && activeTabIndex < tabs.length - 1;

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain scrollbar-gutter-stable">
        {tabs.length > 0 ? tabs.map((tab) => (
          <DocumentTab
            key={tab.tabId}
            tab={tab}
            selected={activeTab?.tabId === tab.tabId}
            syncState={getTabSyncState(tab)}
            onSelect={() => onSelectTab(tab.tabId)}
            onClose={() => onCloseTab(tab.tabId)}
          />
        )) : (
          <span className="px-2 text-sm text-text-subtle">No tabs</span>
        )}
      </div>
      <Toolbar aria-label="Pane controls">
        <DropdownMenu>
          <ToolbarDropdownIconTrigger label="Pane actions" className="app-region-no-drag h-7 w-7">
            <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
          </ToolbarDropdownIconTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!activeTab || !canSplit} onSelect={onSplitPane}>
              <Columns2 aria-hidden="true" className="h-4 w-4" />
              Split Right
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!activeTab || !canMoveToOtherPane} onSelect={onMoveTabToOtherPane}>
              <ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
              Move Tab to Other Pane
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!activeTab || tabs.length <= 1} onSelect={() => activeTab && onCloseOtherTabs(activeTab.tabId)}>
              <X aria-hidden="true" className="h-4 w-4" />
              Close Other Tabs
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!activeTab || !hasTabsToRight} onSelect={() => activeTab && onCloseTabsToRight(activeTab.tabId)}>
              <X aria-hidden="true" className="h-4 w-4" />
              Close Tabs to Right
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canReopenLastClosedTab} onSelect={onReopenLastClosedTab}>
              <FileText aria-hidden="true" className="h-4 w-4" />
              Reopen Last Closed Tab
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Toolbar>
    </div>
  );
}
