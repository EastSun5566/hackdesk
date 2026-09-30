import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ArrowLeft, ArrowRight, ArrowLeftRight, Columns2, FileText, MoreHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

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
  activeTabRef,
  draggedRef,
  onSelect,
  onClose,
}: {
  tab: OpenNoteTab;
  selected: boolean;
  syncState: DocumentSyncState;
  activeTabRef?: MutableRefObject<HTMLLIElement | null>;
  draggedRef: MutableRefObject<boolean>;
  onSelect: () => void;
  onClose: () => void;
}) {
  const title = tab.title || 'Untitled';
  const { isDragging, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: tab.tabId });
  const setTabNode = useCallback((element: HTMLLIElement | null) => {
    setNodeRef(element);
    if (activeTabRef) activeTabRef.current = element;
  }, [setNodeRef, activeTabRef]);

  return (
    <li
      ref={setTabNode}
      style={{ transform: CSS.Transform.toString(transform ? { ...transform, y: 0 } : null), transition }}
      className={cn(
        'group/tab app-region-no-drag relative flex h-8 min-w-0 max-w-56 shrink-0 items-center gap-2 rounded-[6px] border px-2 text-sm transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none',
        isDragging && 'z-10 opacity-70',
        selected
          ? 'border-border-default bg-background-default text-text-default shadow-sm'
          : 'border-transparent bg-transparent text-text-subtle hover:bg-element-bg-hover hover:text-text-default',
      )}
    >
      <button
        type="button"
        className="app-region-no-drag flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        ref={setActivatorNodeRef}
        {...listeners}
        onPointerDown={(event) => {
          draggedRef.current = false;
          listeners?.onPointerDown?.(event);
        }}
        onClick={(event) => {
          if (!draggedRef.current || event.detail === 0) onSelect();
        }}
        aria-current={selected ? 'page' : undefined}
        aria-label={`Select ${title} tab`}
      >
        <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{title}</span>
        <TabStatusIndicator state={syncState} />
      </button>
      <button
        type="button"
        className={cn(
          'app-region-no-drag grid size-6 shrink-0 place-items-center rounded-[4px] text-text-subtle transition-[opacity,color,background-color] duration-150 hover:bg-background-selected hover:text-text-default focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring group-hover/tab:opacity-100 motion-reduce:transition-none',
          selected ? 'opacity-100' : 'opacity-0',
        )}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label={`Close ${title}`}
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </li>
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
  onReorderTab,
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
  onReorderTab: (tabId: string, overTabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onSplitPane: () => void;
  tabs: OpenNoteTab[];
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // Escape can detach the sensor before mouseup produces a native click.
  // Reset on the next pointer gesture, while allowing keyboard activation.
  const draggedRef = useRef(false);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorderTab(String(active.id), String(over.id));
  };
  const activeTabRef = useRef<HTMLLIElement | null>(null);
  const activeTabIndex = activeTab ? tabs.findIndex((tab) => tab.tabId === activeTab.tabId) : -1;
  const hasTabsToRight = activeTabIndex >= 0 && activeTabIndex < tabs.length - 1;

  useEffect(() => {
    activeTabRef.current?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTab?.tabId, activeTabIndex]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => { draggedRef.current = true; }} onDragEnd={handleDragEnd}>
      <div className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
        <nav
          aria-label="Open documents"
          className="flex h-full min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain px-1 py-1 scrollbar-gutter-stable"
        >
          {tabs.length > 0 ? (
            <SortableContext items={tabs.map(tab => tab.tabId)} strategy={horizontalListSortingStrategy}>
              <ul className="m-0 flex min-w-0 list-none items-center gap-1 p-0">
                {tabs.map((tab) => (
                  <DocumentTab
                    key={tab.tabId}
                    tab={tab}
                    selected={activeTab?.tabId === tab.tabId}
                    syncState={getTabSyncState(tab)}
                    draggedRef={draggedRef}
                    activeTabRef={activeTab?.tabId === tab.tabId ? activeTabRef : undefined}
                    onSelect={() => onSelectTab(tab.tabId)}
                    onClose={() => onCloseTab(tab.tabId)}
                  />
                ))}
              </ul>
            </SortableContext>
          ) : null}
        </nav>
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
              <DropdownMenuItem disabled={activeTabIndex <= 0} onSelect={() => activeTab && activeTabIndex > 0 && onReorderTab(activeTab.tabId, tabs[activeTabIndex - 1].tabId)}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Move Tab Left
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!hasTabsToRight} onSelect={() => activeTab && hasTabsToRight && onReorderTab(activeTab.tabId, tabs[activeTabIndex + 1].tabId)}>
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                Move Tab Right
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
    </DndContext>
  );
}
