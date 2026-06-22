import { ArrowLeftRight, Columns2, FileText, MoreHorizontal, X } from 'lucide-react';
import { Fragment } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { Tooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type {
  DocumentSummary,
  NoteSummary,
  UpdateNoteInput,
  UploadNoteImageInput,
  UploadNoteImageResult,
} from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';
import { cn } from '@/lib/utils';

import { DocumentDetail, type DocumentSyncState } from './DocumentDetail';
import type { NotePane, OpenNoteTab } from './note-workspace';
import { EmptyState, ToolbarDropdownIconTrigger } from './interaction-primitives';
import type { ReaderMode } from './ui-preferences';

export type DocumentPaneView = {
  pane: NotePane;
  activeTab: OpenNoteTab | null;
  selectedNote: Pick<NoteSummary, 'title'> | null;
  document?: DocumentSummary;
  title: string;
  content: string;
  isLoading: boolean;
  syncState: DocumentSyncState;
  isSaving: boolean;
  isSavingMetadata: boolean;
  isUploadingImage: boolean;
  isDeleting: boolean;
};

function getSyncStateLabel(state: DocumentSyncState) {
  return {
    idle: 'Unsaved',
    loading: 'Loading',
    cached: 'Cached',
    saving: 'Saving',
    saved: 'Saved',
    save_failed: 'Save failed',
    conflict: 'Conflict',
  }[state];
}

function TabStatusDot({ state }: { state: DocumentSyncState }) {
  return (
    <Tooltip content={getSyncStateLabel(state)}>
      <span
        aria-label={getSyncStateLabel(state)}
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          state === 'idle' && 'bg-warning-default',
          state === 'loading' && 'bg-text-subtle',
          state === 'cached' && 'bg-primary-default',
          state === 'saving' && 'bg-primary-default',
          state === 'saved' && 'bg-success-default',
          (state === 'save_failed' || state === 'conflict') && 'bg-destructive-default',
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
        'group/tab flex h-9 min-w-0 max-w-56 items-center gap-2 rounded-[6px] border px-2 text-sm transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none',
        selected
          ? 'border-border-default bg-background-default text-text-default'
          : 'border-transparent bg-transparent text-text-subtle hover:bg-element-bg-hover hover:text-text-default',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default"
        onClick={onSelect}
        aria-current={selected ? 'page' : undefined}
        aria-label={`Select ${title} tab`}
      >
        <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{title}</span>
        <TabStatusDot state={syncState} />
      </button>
      <button
        type="button"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] text-text-subtle opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-background-selected hover:text-text-default focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default group-hover/tab:opacity-100 motion-reduce:transition-none"
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

function PaneTabBar({
  activePane,
  tabs,
  activeTab,
  getTabSyncState,
  canSplit,
  canMoveToOtherPane,
  canReopenLastClosedTab,
  onFocusPane,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onSplitPane,
  onMoveTabToOtherPane,
  onReopenLastClosedTab,
}: {
  activePane: boolean;
  tabs: OpenNoteTab[];
  activeTab: OpenNoteTab | null;
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  canSplit: boolean;
  canMoveToOtherPane: boolean;
  canReopenLastClosedTab: boolean;
  onFocusPane: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onSplitPane: () => void;
  onMoveTabToOtherPane: () => void;
  onReopenLastClosedTab: () => void;
}) {
  const activeTabIndex = activeTab ? tabs.findIndex((tab) => tab.tabId === activeTab.tabId) : -1;
  const hasTabsToRight = activeTabIndex >= 0 && activeTabIndex < tabs.length - 1;

  return (
    <div
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 border-b border-border-default bg-background-muted px-2',
        activePane && 'bg-background-default ring-1 ring-inset ring-primary-default/35',
      )}
      onPointerDown={onFocusPane}
    >
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
      <DropdownMenu>
        <ToolbarDropdownIconTrigger label="Pane actions" className="h-8 w-8">
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
    </div>
  );
}

export function DocumentWorkspace({
  panes,
  activePaneId,
  folderTree,
  readerMode,
  shareOpen,
  isInspectorCollapsed,
  getPaneView,
  getPaneTabs,
  getTabSyncState,
  canReopenLastClosedTab,
  onResizePanes,
  onFocusPane,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onSplitPane,
  onMoveTabToOtherPane,
  onReopenLastClosedTab,
  onOpenEditor,
  onOpenExternal,
  onCopyLink,
  onCopyMarkdownLink,
  onExportMarkdown,
  onSave,
  onSaveMetadata,
  onSaveSharing,
  onUploadImage,
  onDelete,
  onTitleChange,
  onContentChange,
  onToggleInspector,
  onReaderModeChange,
  onShareOpenChange,
}: {
  panes: NotePane[];
  activePaneId: string;
  folderTree: FolderTree;
  readerMode: ReaderMode;
  shareOpen: boolean;
  isInspectorCollapsed: boolean;
  getPaneView: (pane: NotePane) => DocumentPaneView;
  getPaneTabs: (pane: NotePane) => OpenNoteTab[];
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  canReopenLastClosedTab: boolean;
  onResizePanes: (sizes: Record<string, number>) => void;
  onFocusPane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (paneId: string, tabId: string) => void;
  onCloseTabsToRight: (paneId: string, tabId: string) => void;
  onSplitPane: () => void;
  onMoveTabToOtherPane: () => void;
  onReopenLastClosedTab: () => void;
  onOpenEditor: (document: DocumentSummary) => void;
  onOpenExternal: (url: string) => void;
  onCopyLink: (document: DocumentSummary) => void;
  onCopyMarkdownLink: (document: DocumentSummary) => void;
  onExportMarkdown: (document: DocumentSummary, title: string, content: string) => void;
  onSave: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveSharing: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onUploadImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
  onDelete: (document: DocumentSummary) => void;
  onTitleChange: (tab: OpenNoteTab, title: string) => void;
  onContentChange: (tab: OpenNoteTab, content: string) => void;
  onToggleInspector: () => void;
  onReaderModeChange: (mode: ReaderMode) => void;
  onShareOpenChange: (open: boolean) => void;
}) {
  if (panes.every((pane) => pane.tabIds.length === 0)) {
    return (
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background-default">
        <EmptyState title="Select a note." description="Choose a note from the navigator to read or edit it." />
      </section>
    );
  }

  const defaultLayout = Object.fromEntries(panes.map((pane) => [pane.paneId, pane.size]));

  return (
    <Group
      id="document-workspace-panes"
      orientation="horizontal"
      className="min-w-0 flex-1 bg-background-default"
      defaultLayout={defaultLayout}
      onLayoutChanged={onResizePanes}
    >
      {panes.map((pane, index) => {
        const view = getPaneView(pane);
        const isActivePane = pane.paneId === activePaneId;
        const tabs = getPaneTabs(pane);

        return (
          <Fragment key={pane.paneId}>
            {index > 0 ? (
              <Separator
                id={`document-pane-separator-${pane.paneId}`}
                className="relative w-2 cursor-col-resize bg-background-muted outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border-default/60 hover:before:bg-primary-default focus-visible:before:bg-primary-default"
              />
            ) : null}
            <Panel
              id={pane.paneId}
              key={pane.paneId}
              minSize="24rem"
              className="min-w-0 overflow-hidden"
            >
              <section
                className={cn(
                  'flex h-full min-w-0 flex-col border-l border-border-default bg-background-default',
                  isActivePane && 'bg-background-default',
                )}
                onFocusCapture={() => onFocusPane(pane.paneId)}
              >
                <PaneTabBar
                  activePane={isActivePane}
                  tabs={tabs}
                  activeTab={view.activeTab}
                  getTabSyncState={getTabSyncState}
                  canSplit={panes.length < 2}
                  canMoveToOtherPane={panes.length > 1}
                  canReopenLastClosedTab={canReopenLastClosedTab}
                  onFocusPane={() => onFocusPane(pane.paneId)}
                  onSelectTab={(tabId) => onSelectTab(pane.paneId, tabId)}
                  onCloseTab={onCloseTab}
                  onCloseOtherTabs={(tabId) => onCloseOtherTabs(pane.paneId, tabId)}
                  onCloseTabsToRight={(tabId) => onCloseTabsToRight(pane.paneId, tabId)}
                  onSplitPane={onSplitPane}
                  onMoveTabToOtherPane={onMoveTabToOtherPane}
                  onReopenLastClosedTab={onReopenLastClosedTab}
                />
                <DocumentDetail
                  focusZone={isActivePane ? 'editor' : undefined}
                  inspectorPanelId={`note-inspector-panel-${pane.paneId}`}
                  selectedNote={view.selectedNote}
                  document={view.document}
                  folderTree={folderTree}
                  title={view.title}
                  content={view.content}
                  isLoading={view.isLoading}
                  syncState={view.syncState}
                  readerMode={readerMode}
                  shareOpen={isActivePane && shareOpen}
                  isInspectorCollapsed={!isActivePane || isInspectorCollapsed}
                  onOpenEditor={onOpenEditor}
                  onOpenExternal={onOpenExternal}
                  onCopyLink={onCopyLink}
                  onCopyMarkdownLink={onCopyMarkdownLink}
                  onExportMarkdown={onExportMarkdown}
                  onSave={onSave}
                  onSaveMetadata={onSaveMetadata}
                  onSaveSharing={onSaveSharing}
                  onUploadImage={onUploadImage}
                  onDelete={onDelete}
                  onTitleChange={(title) => view.activeTab && onTitleChange(view.activeTab, title)}
                  onContentChange={(content) => view.activeTab && onContentChange(view.activeTab, content)}
                  onToggleInspector={onToggleInspector}
                  onReaderModeChange={onReaderModeChange}
                  onShareOpenChange={onShareOpenChange}
                  isSaving={view.isSaving}
                  isSavingMetadata={view.isSavingMetadata}
                  isUploadingImage={view.isUploadingImage}
                  isDeleting={view.isDeleting}
                />
              </section>
            </Panel>
          </Fragment>
        );
      })}
    </Group>
  );
}
