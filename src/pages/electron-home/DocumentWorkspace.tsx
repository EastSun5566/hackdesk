import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core';
import type { EditorRequest } from './useWorkbenchEditorRequests';
import { FileText, Plus, Search } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Group, Panel, Separator, type GroupImperativeHandle, type GroupProps } from 'react-resizable-panels';

import { MAX_NOTE_PANES } from '@/lib/electron-actions';
import type {
  DocumentSummary,
  NoteSummary,
} from '@/lib/electron-api';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import type { FolderTree } from '@/lib/hackmd-folders';
import type { EditorMode } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { DocumentDetail, type DocumentSyncState } from './DocumentDetail';
import { DocumentTabs, tabStripDropId, WorkspaceTabDndContext } from './DocumentTabs';
import { getNoteTabEditorKey, getSavedTabNoteIdentity, isDraftNoteTab, isBlankNoteTab, type NotePane, type OpenNoteTab } from './note-workspace';
import { ActionMenuShortcut } from './ActionShortcutContext';
import { EmptyState } from './interaction-primitives';
import { layoutNodeId, layoutPaneIds, type PaneDirection, type PaneLayoutNode } from './pane-layout';
import { CARD_SURFACE_CLASS, GAP_SASH_CLASS, GAP_SASH_ROW_CLASS } from './ui';
import { UnavailableDocumentDetail } from './UnavailableDocumentDetail';
import { documentPaneId, documentTabId } from './document-tab-ids';
import { NoteIcon } from './note-kind';
import { PaneTabIdContext } from './useBookSession';
import { useNoteSummaryLookup } from './NoteSummaryCard';
import { useOverlay } from './WorkbenchOverlaysContext';
import { PaneDocumentActions, useWorkbenchDocumentActions } from './DocumentActionsContext';

function PaneGroup({ layout, id, orientation, ...props }: Omit<GroupProps, 'defaultLayout' | 'groupRef'> & { layout: Record<string, number> }) {
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  // Only changed percentages should synchronize; unrelated renders must not reset an ongoing drag.
  const layoutKey = JSON.stringify(layout);
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const desired: Record<string, number> = JSON.parse(layoutKey);
    const current = group.getLayout();
    const ids = Object.keys(desired);
    // The library defers layout while a group mounts hidden or its panels are registering.
    if (ids.length !== Object.keys(current).length || ids.some(id => current[id] === undefined)) return;
    if (ids.some(id => Math.abs(current[id] - desired[id]) > 0.001)) group.setLayout(desired);
  }, [layoutKey, id, orientation]);
  return <Group {...props} id={id} orientation={orientation} defaultLayout={layout} groupRef={groupRef} />;
}

function movePaneHost(host: HTMLElement, target: HTMLElement) {
  if (host.parentElement === target) return;
  // DOM moves still relocate live selection ranges, even when moveBefore keeps focus intact.
  const selection = document.getSelection();
  const range = selection?.anchorNode && selection.focusNode
    && host.contains(selection.anchorNode) && host.contains(selection.focusNode)
    ? { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset }
    : null;
  if ('moveBefore' in target && host.isConnected && target.isConnected) {
    target.moveBefore(host, null);
  } else {
    const focused = host.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    target.appendChild(host);
    focused?.focus({ preventScroll: true });
  }
  if (range && selection) selection.setBaseAndExtent(range.anchor, range.anchorOffset, range.focus, range.focusOffset);
}

type PaneHost = {
  element: HTMLDivElement;
  scroll: Array<{ element: HTMLElement; top: number; left: number }>;
};

function BlankTabPage({
  canCreateNote,
  onCreateNote,
  onQuickOpen,
  onOpenNoteTarget,
  recentNotes,
}: {
  canCreateNote: boolean;
  onCreateNote: () => void;
  onQuickOpen: () => void;
  onOpenNoteTarget?: (note: ElectronRecentNote) => void;
  recentNotes: ElectronRecentNote[];
}) {
  const recent = onOpenNoteTarget ? recentNotes.slice(0, 8) : [];
  const lookupNoteSummary = useNoteSummaryLookup();
  // Like a browser's new-tab page: find something first, make something second, and the notes
  // you were just in below. Set high rather than centred, so the list grows downward.
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-6 pt-24">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={onQuickOpen}
          className="flex h-9 w-full items-center gap-2 rounded border border-border-default bg-background-default px-3 text-left text-sm text-text-subtle transition-colors hover:border-element-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search notes</span>
          <ActionMenuShortcut actionId="open-quick-open" />
        </button>
        {canCreateNote ? (
          <button
            type="button"
            onClick={onCreateNote}
            className="flex h-8 items-center gap-2 rounded px-3 text-sm text-text-default transition-colors hover:bg-background-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Plus aria-hidden="true" className="size-4 shrink-0 text-icon-default" />
            <span className="min-w-0 flex-1 truncate text-left">New Note</span>
            <ActionMenuShortcut actionId="new-note" />
          </button>
        ) : null}
        {recent.length > 0 ? (
          <nav aria-label="Recently opened notes" className="flex flex-col gap-1 pt-3">
            <h2 className="px-3 text-xs font-medium text-text-subtle">Recently opened</h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {recent.map((note) => (
                <li key={`${note.teamPath ?? 'personal'}:${note.noteId}`}>
                  <button
                    type="button"
                    onClick={() => onOpenNoteTarget?.(note)}
                    className="flex h-8 w-full items-center gap-2 rounded px-3 text-left text-sm text-text-default transition-colors hover:bg-background-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <NoteIcon note={lookupNoteSummary(note.noteId)?.note} noteId={note.noteId} className="size-3.5 text-icon-default" />
                    <span className="min-w-0 flex-1 truncate">{note.title || 'Untitled'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function PaneOutlet({ host }: { host: PaneHost }) {
  const workspace = useRef<HTMLElement | null>(null);
  const attach = useCallback((slot: HTMLDivElement | null) => {
    if (slot) {
      workspace.current = slot.closest<HTMLElement>('[data-document-workspace]');
      movePaneHost(host.element, slot);
      for (const position of host.scroll) {
        position.element.scrollTop = position.top;
        position.element.scrollLeft = position.left;
      }
      host.scroll = [];
    } else if (workspace.current?.isConnected) {
      // Park the editor before React removes its old split, keeping it connected during reparenting.
      // The temporary parent can clamp scroll offsets before the new panel acquires its size.
      host.scroll = Array.from(host.element.querySelectorAll<HTMLElement>('*'))
        .filter(element => element.scrollTop !== 0 || element.scrollLeft !== 0)
        .map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }));
      movePaneHost(host.element, workspace.current);
    }
  }, [host]);
  return <div ref={attach} className="flex min-h-0 min-w-0 flex-1" />;
}

export type DocumentPaneView = {
  pane: NotePane;
  activeTab: OpenNoteTab | null;
  selectedNote: Pick<NoteSummary, 'title'> & Partial<Pick<NoteSummary, 'id' | 'teamPath'>> | null;
  document?: DocumentSummary;
  isBlank: boolean;
  isDraft: boolean;
  title: string;
  content: string;
  recovery?: {
    kind: 'disk_changed' | 'remote_changed' | 'save_failed';
    message: string;
  } | null;
  /** The saved note could not be loaded; `missing` is confirmed, `read_error` may be temporary. */
  unavailable?: {
    kind: 'missing' | 'read_error';
    message: string;
    hasDraft: boolean;
    isRetrying?: boolean;
  } | null;
  isLoading: boolean;
  syncState: DocumentSyncState;
  isSaving: boolean;
  isSavingMetadata: boolean;
  isUploadingImage: boolean;
  isDeleting: boolean;
};

export type DocumentWorkspaceTabsProps = {
  getPaneTabs: (pane: NotePane) => OpenNoteTab[];
  getTabSyncState: (tab: OpenNoteTab) => DocumentSyncState;
  recentlyClosedCount: number;
  onSelectTab: (paneId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (paneId: string, tabId: string) => void;
  onCloseTabsToRight: (paneId: string, tabId: string) => void;
  onReorderTab: (paneId: string, tabId: string, overTabId: string) => void;
  onMoveTabToPane: (tabId: string, targetPaneId: string, options?: { overTabId?: string; copy?: boolean }) => void;
  onSplitTabToNewPane: (tabId: string, target: { paneId?: string; edge?: boolean; direction: PaneDirection }, options?: { copy?: boolean }) => void;
  onReopenLastClosedTab: (paneId: string) => void;
  onKeepTab: (tabId: string) => void;
  onSplitPane: (direction: PaneDirection, paneId: string) => void;
  onMoveTabToOtherPane: () => void;
  onClosePane: (paneId: string) => void;
  onEqualizePanes: () => void;
  onNewTab: (paneId: string) => void;
};

type DropOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type DropZonePreview =
  | { kind: 'workspace-edge'; direction: PaneDirection; rect: DropOverlayRect }
  | { kind: 'pane-edge'; paneId: string; direction: PaneDirection; rect: DropOverlayRect }
  | { kind: 'pane-center'; paneId: string; rect: DropOverlayRect };

function getEdgePreviewRect(bounds: DropOverlayRect, direction: PaneDirection, ratio = 0.5): DropOverlayRect {
  switch (direction) {
    case 'left': return { left: bounds.left, top: bounds.top, width: bounds.width * ratio, height: bounds.height };
    case 'right': return { left: bounds.left + bounds.width * (1 - ratio), top: bounds.top, width: bounds.width * ratio, height: bounds.height };
    case 'up': return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height * ratio };
    case 'down': return { left: bounds.left, top: bounds.top + bounds.height * (1 - ratio), width: bounds.width, height: bounds.height * ratio };
  }
}

function pointInRect(x: number, y: number, rect: DOMRect) {
  return rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function DocumentWorkspace({
  panes,
  layout,
  zoomedPaneId,
  activePaneId,
  editorMode,
  folderTree,
  isInspectorCollapsed,
  isPaneInspectorCollapsed,
  inspectorWidth,
  onInspectorWidthChange,
  getPaneView,
  scopeKey,
  editorRequests,
  onEditorRequestHandled,
  onResizeSplit,
  onEqualizeSplit,
  onTogglePaneZoom,
  onFocusPane,
  canCreateNote,
  onCreateNote,
  onQuickOpen,
  recentNotes = [],
  tabsWorkspace,
}: {
  panes: NotePane[];
  /** How the panes are arranged; see pane-layout. */
  layout: PaneLayoutNode;
  /** The pane filling the editor area, with the others hidden but still mounted. */
  zoomedPaneId: string | null;
  activePaneId: string;
  editorMode: EditorMode;
  folderTree: FolderTree;
  isInspectorCollapsed: boolean;
  isPaneInspectorCollapsed?: (paneId: string) => boolean;
  inspectorWidth?: number;
  onInspectorWidthChange?: (width: number) => void;
  getPaneView: (pane: NotePane) => DocumentPaneView;
  scopeKey: string;
  editorRequests: EditorRequest[];
  onEditorRequestHandled: (id: number) => void;
  onResizeSplit: (splitId: string, sizes: Record<string, number>) => void;
  /** Equalizes the two sides of a split container (e.g. separator double-click). */
  onEqualizeSplit?: (splitId: string) => void;
  /** Zooms the active pane or restores the others; a pane's button makes it active first. */
  onTogglePaneZoom: () => void;
  onFocusPane: (paneId: string) => void;
  canCreateNote: boolean;
  onCreateNote: () => void;
  onQuickOpen: () => void;
  recentNotes?: ElectronRecentNote[];
  tabsWorkspace?: DocumentWorkspaceTabsProps;
}) {
  const { onOpenNoteTarget, onCopyDraft, onExportDraft, onOpenAsNewDraft, onRetryLoad } = useWorkbenchDocumentActions();
  // Note Settings, Share and Versions open over the active pane; the workbench overlays hold whether they are open.
  const noteMetadataOpen = useOverlay((overlays) => overlays.noteMetadata);
  const shareOpen = useOverlay((overlays) => overlays.share);
  const versionsOpen = useOverlay((overlays) => overlays.versions);
  const [paneHosts] = useState(() => new Map<string, PaneHost>());
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const isEmpty = panes.every(pane => pane.tabIds.length === 0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeDrag, setActiveDrag] = useState<{ tabId: string; sourcePaneId: string } | null>(null);
  const [copyMode, setCopyMode] = useState(false);
  const [dropOverlay, setDropOverlay] = useState<DropZonePreview | null>(null);
  const [activeStripDropId, setActiveStripDropId] = useState<string | null>(null);
  const initialPointRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const copyModeRef = useRef(false);
  const overRef = useRef<Over | null>(null);
  const dropOverlayRef = useRef<DropZonePreview | null>(null);

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const { pointerCoordinates } = args;
    const workspaceEl = workspaceRef.current;
    if (pointerCoordinates && workspaceEl) {
      const tabRegions = workspaceEl.querySelectorAll<HTMLElement>('[data-hackdesk-focus="tabs"][data-document-pane-id]');
      let hoveredPaneId: string | null = null;
      for (const region of tabRegions) {
        if (pointInRect(pointerCoordinates.x, pointerCoordinates.y, region.getBoundingClientRect())) {
          hoveredPaneId = region.dataset.documentPaneId ?? null;
          break;
        }
      }
      if (!hoveredPaneId) {
        return [];
      }
      const scopedContainers = args.droppableContainers.filter(
        (container) => (container.data.current as { paneId?: string } | undefined)?.paneId === hoveredPaneId,
      );
      return closestCenter({
        ...args,
        droppableContainers: scopedContainers.length > 0 ? scopedContainers : args.droppableContainers,
      });
    }
    return closestCenter(args);
  }, []);

  const computeDropTarget = useCallback((
    drag: { tabId: string; sourcePaneId: string } | null,
    copy: boolean,
    point: { x: number; y: number } | null,
    over: Over | null,
  ): { zone: DropZonePreview | null; stripId: string | null } => {
    const workspaceEl = workspaceRef.current;
    if (!drag || !workspaceEl) return { zone: null, stripId: null };

    if (!point) {
      const overData = over?.data.current as { type?: string; paneId?: string } | undefined;
      if (overData?.type === 'tab' && overData.paneId) {
        return { zone: null, stripId: tabStripDropId(overData.paneId) };
      }
      if (overData?.type === 'tab-strip' && overData.paneId) {
        return { zone: null, stripId: tabStripDropId(overData.paneId) };
      }
      return { zone: null, stripId: null };
    }

    // If pointer is inside any pane's tab bar, treat it as a strip drop target rather than a split edge.
    const tabRegions = workspaceEl.querySelectorAll<HTMLElement>('[data-hackdesk-focus="tabs"][data-document-pane-id]');
    for (const region of tabRegions) {
      const rect = region.getBoundingClientRect();
      if (pointInRect(point.x, point.y, rect)) {
        const targetPaneId = region.dataset.documentPaneId;
        return { zone: null, stripId: targetPaneId ? tabStripDropId(targetPaneId) : null };
      }
    }

    const canSplitMore = panes.length < MAX_NOTE_PANES && !zoomedPaneId;
    const sourcePane = panes.find((candidate) => candidate.paneId === drag.sourcePaneId);
    const sourceTabCount = sourcePane?.tabIds.length ?? 0;
    const workspaceRect = workspaceEl.getBoundingClientRect();

    // Check outer workspace perimeter split when multiple panes already exist.
    if (canSplitMore && panes.length > 1 && pointInRect(point.x, point.y, workspaceRect)) {
      const outerMargin = 18;
      const distLeft = point.x - workspaceRect.left;
      const distRight = workspaceRect.right - point.x;
      const distTop = point.y - workspaceRect.top;
      const distBottom = workspaceRect.bottom - point.y;
      const edges: Array<{ direction: PaneDirection; distance: number }> = [
        { direction: 'left', distance: distLeft },
        { direction: 'right', distance: distRight },
        { direction: 'up', distance: distTop },
        { direction: 'down', distance: distBottom },
      ];
      const closestOuter = edges.reduce((best, item) => (item.distance < best.distance ? item : best));
      if (closestOuter.distance <= outerMargin) {
        const bounds: DropOverlayRect = {
          left: 0,
          top: 0,
          width: workspaceRect.width,
          height: workspaceRect.height,
        };
        return {
          zone: {
            kind: 'workspace-edge',
            direction: closestOuter.direction,
            rect: getEdgePreviewRect(bounds, closestOuter.direction, 0.28),
          },
          stripId: null,
        };
      }
    }

    const paneEls = workspaceEl.querySelectorAll<HTMLElement>('section[data-document-pane-id]');
    for (const paneEl of paneEls) {
      const rect = paneEl.getBoundingClientRect();
      if (!pointInRect(point.x, point.y, rect)) continue;
      const targetPaneId = paneEl.dataset.documentPaneId;
      if (!targetPaneId) continue;
      const localBounds: DropOverlayRect = {
        left: rect.left - workspaceRect.left,
        top: rect.top - workspaceRect.top,
        width: rect.width,
        height: rect.height,
      };
      const thresholdX = Math.min(84, Math.max(36, rect.width * 0.25));
      const thresholdY = Math.min(84, Math.max(36, rect.height * 0.25));
      const canSplitThisPane = canSplitMore && (copy || targetPaneId !== drag.sourcePaneId || sourceTabCount > 1);
      if (canSplitThisPane) {
        const allCandidates: Array<{ direction: PaneDirection; ratio: number; distance: number; within: boolean }> = [
          { direction: 'left', distance: point.x - rect.left, ratio: (point.x - rect.left) / Math.max(1, rect.width), within: point.x - rect.left <= thresholdX },
          { direction: 'right', distance: rect.right - point.x, ratio: (rect.right - point.x) / Math.max(1, rect.width), within: rect.right - point.x <= thresholdX },
          { direction: 'up', distance: point.y - rect.top, ratio: (point.y - rect.top) / Math.max(1, rect.height), within: point.y - rect.top <= thresholdY },
          { direction: 'down', distance: rect.bottom - point.y, ratio: (rect.bottom - point.y) / Math.max(1, rect.height), within: rect.bottom - point.y <= thresholdY },
        ];
        const candidates = allCandidates.filter((entry) => entry.within);
        if (candidates.length > 0) {
          const winner = candidates.reduce((best, entry) => (entry.ratio < best.ratio ? entry : best));
          return {
            zone: {
              kind: 'pane-edge',
              paneId: targetPaneId,
              direction: winner.direction,
              rect: getEdgePreviewRect(localBounds, winner.direction, 0.5),
            },
            stripId: null,
          };
        }
      }
      if (targetPaneId !== drag.sourcePaneId || copy) {
        return {
          zone: {
            kind: 'pane-center',
            paneId: targetPaneId,
            rect: localBounds,
          },
          stripId: null,
        };
      }
      return { zone: null, stripId: null };
    }

    return { zone: null, stripId: null };
  }, [panes, zoomedPaneId]);

  const syncDropState = useCallback((
    drag: { tabId: string; sourcePaneId: string } | null,
    copy: boolean,
    point: { x: number; y: number } | null,
    over: Over | null,
  ) => {
    const { zone, stripId } = computeDropTarget(drag, copy, point, over);
    dropOverlayRef.current = zone;
    setDropOverlay(zone);
    setActiveStripDropId(stripId);
  }, [computeDropTarget]);

  useEffect(() => {
    if (!activeDrag) return;
    const handlePointerMove = (event: PointerEvent) => {
      const point = { x: event.clientX, y: event.clientY };
      pointerRef.current = point;
      copyModeRef.current = event.altKey;
      setCopyMode(event.altKey);
      syncDropState(activeDrag, event.altKey, point, overRef.current);
    };
    const handleKeyChange = (event: KeyboardEvent) => {
      if (copyModeRef.current === event.altKey) return;
      copyModeRef.current = event.altKey;
      setCopyMode(event.altKey);
      syncDropState(activeDrag, event.altKey, pointerRef.current, overRef.current);
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('keydown', handleKeyChange);
    window.addEventListener('keyup', handleKeyChange);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('keydown', handleKeyChange);
      window.removeEventListener('keyup', handleKeyChange);
    };
  }, [activeDrag, syncDropState]);

  const clearDragState = useCallback(() => {
    setActiveDrag(null);
    setCopyMode(false);
    copyModeRef.current = false;
    setDropOverlay(null);
    dropOverlayRef.current = null;
    setActiveStripDropId(null);
    initialPointRef.current = null;
    pointerRef.current = null;
    overRef.current = null;
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { paneId?: string; tabId?: string } | undefined;
    const tabId = data?.tabId ?? String(event.active.id);
    const sourcePaneId = data?.paneId
      ?? panes.find((candidate) => candidate.tabIds.includes(tabId))?.paneId
      ?? activePaneId;
    const activator = event.activatorEvent as MouseEvent | PointerEvent | undefined;
    const initialCopy = Boolean(activator?.altKey);
    const initialPoint = activator && 'clientX' in activator ? { x: activator.clientX, y: activator.clientY } : null;
    initialPointRef.current = initialPoint;
    pointerRef.current = initialPoint;
    copyModeRef.current = initialCopy;
    overRef.current = null;
    setCopyMode(initialCopy);
    setActiveDrag({ tabId, sourcePaneId });
  }, [activePaneId, panes]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    overRef.current = event.over;
    if (!activeDrag) return;
    const nextPoint = initialPointRef.current
      ? { x: initialPointRef.current.x + event.delta.x, y: initialPointRef.current.y + event.delta.y }
      : pointerRef.current;
    if (nextPoint) {
      pointerRef.current = nextPoint;
    }
    syncDropState(activeDrag, copyModeRef.current, nextPoint, event.over);
  }, [activeDrag, syncDropState]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    overRef.current = event.over;
    if (!activeDrag) return;
    syncDropState(activeDrag, copyModeRef.current, pointerRef.current, event.over);
  }, [activeDrag, syncDropState]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!tabsWorkspace || !activeDrag) {
      clearDragState();
      return;
    }
    const finalCopy = copyModeRef.current || Boolean((event.activatorEvent as MouseEvent | PointerEvent | undefined)?.altKey);
    const zone = dropOverlayRef.current;
    const tabId = activeDrag.tabId;
    const sourcePaneId = activeDrag.sourcePaneId;
    clearDragState();

    if (zone) {
      if (zone.kind === 'workspace-edge') {
        tabsWorkspace.onSplitTabToNewPane(tabId, { edge: true, direction: zone.direction }, { copy: finalCopy });
        return;
      }
      if (zone.kind === 'pane-edge') {
        tabsWorkspace.onSplitTabToNewPane(tabId, { paneId: zone.paneId, direction: zone.direction }, { copy: finalCopy });
        return;
      }
      if (zone.kind === 'pane-center') {
        tabsWorkspace.onMoveTabToPane(tabId, zone.paneId, { copy: finalCopy });
        return;
      }
    }

    const { over } = event;
    if (!over) return;
    const overData = over.data.current as { type?: string; paneId?: string; tabId?: string } | undefined;
    if (overData?.type === 'tab' && overData.paneId) {
      const overTabId = overData.tabId ?? String(over.id);
      if (overData.paneId === sourcePaneId && !finalCopy) {
        if (tabId !== overTabId) tabsWorkspace.onReorderTab(sourcePaneId, tabId, overTabId);
      } else {
        tabsWorkspace.onMoveTabToPane(tabId, overData.paneId, { overTabId, copy: finalCopy });
      }
      return;
    }
    if (overData?.type === 'tab-strip' && overData.paneId) {
      if (overData.paneId !== sourcePaneId || finalCopy) {
        tabsWorkspace.onMoveTabToPane(tabId, overData.paneId, { copy: finalCopy });
      }
      return;
    }

    if (String(event.active.id) !== String(over.id)) {
      const fallbackOverPane = panes.find((candidate) => candidate.tabIds.includes(String(over.id)))?.paneId;
      if (fallbackOverPane && (fallbackOverPane !== sourcePaneId || finalCopy)) {
        tabsWorkspace.onMoveTabToPane(tabId, fallbackOverPane, { overTabId: String(over.id), copy: finalCopy });
      } else {
        tabsWorkspace.onReorderTab(sourcePaneId, tabId, String(over.id));
      }
    }
  }, [activeDrag, clearDragState, panes, tabsWorkspace]);

  const draggedTab = useMemo(() => {
    if (!activeDrag || !tabsWorkspace) return null;
    for (const pane of panes) {
      const found = tabsWorkspace.getPaneTabs(pane).find((tab) => tab.tabId === activeDrag.tabId);
      if (found) return found;
    }
    return null;
  }, [activeDrag, panes, tabsWorkspace]);

  const dndContextValue = useMemo(() => ({
    inWorkspaceDnd: Boolean(tabsWorkspace),
    activeDragTabId: activeDrag?.tabId ?? null,
    dropTargetId: activeStripDropId,
  }), [activeDrag?.tabId, activeStripDropId, tabsWorkspace]);

  useLayoutEffect(() => {
    const livePanes = new Set(isEmpty ? [] : panes.map(pane => pane.paneId));
    for (const [id, host] of paneHosts) {
      if (!livePanes.has(id)) {
        host.element.remove();
        paneHosts.delete(id);
      }
    }
  }, [isEmpty, paneHosts, panes]);
  const paneHost = (paneId: string) => {
    let host = paneHosts.get(paneId);
    if (!host) {
      const element = document.createElement('div');
      element.className = 'flex min-h-0 min-w-0 flex-1 flex-col';
      host = { element, scroll: [] };
      paneHosts.set(paneId, host);
    }
    return host;
  };
  if (isEmpty) {
    return (
      <section className={cn('flex min-w-0 flex-1 flex-col', CARD_SURFACE_CLASS)}>
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No note selected"
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              {canCreateNote ? <Button variant="primary" onClick={onCreateNote}>New Note</Button> : null}
              <Button onClick={onQuickOpen}>Search Notes</Button>
            </div>
          )}
        />
      </section>
    );
  }

  const paneOrder = layoutPaneIds(layout);

  const renderPane = (pane: NotePane) => {
    const index = paneOrder.indexOf(pane.paneId);
    const view = getPaneView(pane);
    const isActivePane = pane.paneId === activePaneId;
    const requests = isActivePane ? editorRequests.filter(request => request.scopeKey === scopeKey
      && request.paneId === pane.paneId && request.tabId === view.activeTab?.tabId
      && request.documentId === (view.activeTab && (
        getSavedTabNoteIdentity(view.activeTab)?.id
        ?? (isDraftNoteTab(view.activeTab) ? view.activeTab.draftId : isBlankNoteTab(view.activeTab) ? view.activeTab.tabId : view.activeTab.noteId)
      ))) : [];
    const requestId = (kind: EditorRequest['kind']) => requests.find(request => request.kind === kind)?.id ?? 0;

    return (
    <section
      id={documentPaneId(pane.paneId)}
      role={isActivePane ? 'tabpanel' : 'region'}
      aria-labelledby={isActivePane && view.activeTab ? documentTabId(view.activeTab.tabId) : undefined}
      data-navigation-editor-id={view.activeTab?.tabId}
      data-document-pane-id={pane.paneId}
      aria-current={isActivePane ? 'true' : undefined}
      aria-label={isActivePane ? `Active document pane ${index + 1}` : `Document pane ${index + 1}`}
      data-active-pane={isActivePane ? 'true' : 'false'}
      className={cn(
        'scroll-edges relative flex h-full min-w-0 flex-1 flex-col',
        CARD_SURFACE_CLASS,
        // Only several panes need telling apart; zoom and Hack Mode leave one.
        isActivePane && panes.length > 1 && !zoomedPaneId && 'border-primary-default/50',
      )}
      onFocusCapture={() => onFocusPane(pane.paneId)}
    >
      {tabsWorkspace ? (
        <DocumentTabs
          paneId={pane.paneId}
          isActivePane={isActivePane}
          activeTab={view.activeTab}
          canClosePane={panes.length > 1}
          canMoveToOtherPane={panes.length > 1}
          canReopenLastClosedTab={tabsWorkspace.recentlyClosedCount > 0}
          canSplit={panes.length < MAX_NOTE_PANES}
          getTabSyncState={tabsWorkspace.getTabSyncState}
          onCloseOtherTabs={(tabId) => tabsWorkspace.onCloseOtherTabs(pane.paneId, tabId)}
          onClosePane={() => tabsWorkspace.onClosePane(pane.paneId)}
          onCloseTab={tabsWorkspace.onCloseTab}
          onCloseTabsToRight={(tabId) => tabsWorkspace.onCloseTabsToRight(pane.paneId, tabId)}
          onMoveTabToOtherPane={() => {
            if (!isActivePane) onFocusPane(pane.paneId);
            tabsWorkspace.onMoveTabToOtherPane();
          }}
          onReopenLastClosedTab={() => tabsWorkspace.onReopenLastClosedTab(pane.paneId)}
          onReorderTab={(tabId, overTabId) => tabsWorkspace.onReorderTab(pane.paneId, tabId, overTabId)}
          onSelectTab={(tabId) => tabsWorkspace.onSelectTab(pane.paneId, tabId)}
          onKeepTab={tabsWorkspace.onKeepTab}
          onSplitPane={() => tabsWorkspace.onSplitPane('right', pane.paneId)}
          onNewTab={() => tabsWorkspace.onNewTab(pane.paneId)}
          paneLayout={{
            zoomed: zoomedPaneId === pane.paneId,
            onSplitDown: () => tabsWorkspace.onSplitPane('down', pane.paneId),
            onSplitLeft: () => tabsWorkspace.onSplitPane('left', pane.paneId),
            onSplitUp: () => tabsWorkspace.onSplitPane('up', pane.paneId),
            onToggleZoom: () => {
              if (!isActivePane) onFocusPane(pane.paneId);
              onTogglePaneZoom();
            },
            onEqualize: tabsWorkspace.onEqualizePanes,
          }}
          tabs={tabsWorkspace.getPaneTabs(pane)}
        />
      ) : null}
      {view.isBlank ? (
        <BlankTabPage
          canCreateNote={canCreateNote}
          onCreateNote={onCreateNote}
          onQuickOpen={onQuickOpen}
          onOpenNoteTarget={onOpenNoteTarget}
          recentNotes={recentNotes}
        />
      ) : view.unavailable && view.activeTab && !view.document && !view.isDraft && !view.isLoading ? (
        <UnavailableDocumentDetail
          unavailable={view.unavailable}
          title={view.title}
          content={view.content}
          onCopyDraft={onCopyDraft}
          onExportDraft={onExportDraft}
          onOpenAsNewDraft={(title, content) => onOpenAsNewDraft(title, content, pane.paneId)}
          onRetry={() => view.activeTab && onRetryLoad(view.activeTab)}
        />
      ) : (
        // Book reading shows in the book's own tab only; this pane says which tab it shows.
        <PaneTabIdContext.Provider value={view.activeTab?.tabId ?? null}>
          <PaneDocumentActions tab={view.activeTab} paneId={pane.paneId}>
            <DocumentDetail
              // With the tab's note: a book's tab turns chapters in place, and each needs its own editor and undo history.
              editorKey={view.activeTab ? getNoteTabEditorKey(view.activeTab) : `${pane.paneId}:empty`}
              editorMode={editorMode}
              folderTree={folderTree}
              documentState={{
                selectedNote: view.selectedNote,
                document: view.document,
                isDraft: view.isDraft,
                title: view.title,
                content: view.content,
                recovery: view.recovery,
                syncState: view.syncState,
              }}
              layout={{
                focusZone: 'editor',
                inspectorPanelId: `note-inspector-panel-${pane.paneId}`,
                focusRequestId: requestId('focus'),
                searchRequestId: requestId('search'),
                attachImageRequestId: requestId('attach-image'),
                renameRequestId: requestId('rename'),
                aiAssistRequestId: requestId('ai-assist'),
                dictateRequestId: requestId('dictate'),
                onRequestHandled: onEditorRequestHandled,
                noteMetadataOpen: isActivePane && noteMetadataOpen,
                shareOpen: isActivePane && shareOpen,
                versionsOpen: isActivePane && versionsOpen,
                inspectorCollapsed: isPaneInspectorCollapsed ? isPaneInspectorCollapsed(pane.paneId) : (!isActivePane || isInspectorCollapsed),
                inspectorWidth,
                onInspectorWidthChange,
                paneZoom: panes.length > 1 ? { zoomed: zoomedPaneId === pane.paneId, onToggle: onTogglePaneZoom } : undefined,
              }}
              status={{
                loading: view.isLoading,
                saving: view.isSaving,
                savingMetadata: view.isSavingMetadata,
                uploadingImage: view.isUploadingImage,
                deleting: view.isDeleting,
              }}
            />
          </PaneDocumentActions>
        </PaneTabIdContext.Provider>
      )}
    </section>
    );
  };

  // A split is a panel group running its way; a pane is a card. Each child is known by its id, which
  // is also how the group reports sizes back.
  const renderGroup = (node: PaneLayoutNode, children: PaneLayoutNode[], orientation: 'horizontal' | 'vertical', sizes: number[]) => (
    <PaneGroup
      id={node.type === 'split' ? node.id : 'document-workspace-panes'}
      orientation={orientation}
      className="min-h-0 min-w-0 flex-1"
      layout={Object.fromEntries(children.map((child, index) => [layoutNodeId(child), sizes[index]]))}
      onLayoutChanged={node.type === 'split' ? (sizesById) => onResizeSplit(node.id, sizesById) : undefined}
    >
      {children.map((child, index) => {
        const childId = layoutNodeId(child);
        const pane = child.type === 'pane' ? panes.find(candidate => candidate.paneId === child.paneId) : undefined;
        return (
          <Fragment key={childId}>
            {index > 0 ? (
              <Separator
                id={`document-pane-separator-${childId}`}
                aria-label={`Resize document panes ${orientation === 'horizontal' ? 'side by side' : 'stacked'}, between pane ${paneOrder.indexOf(layoutPaneIds(children[index - 1]).at(-1)!) + 1} and pane ${paneOrder.indexOf(layoutPaneIds(child)[0]) + 1}`}
                className={orientation === 'horizontal' ? GAP_SASH_CLASS : GAP_SASH_ROW_CLASS}
                onDoubleClick={node.type === 'split' && onEqualizeSplit ? () => onEqualizeSplit(node.id) : undefined}
              />
            ) : null}
            <Panel
              id={childId}
              minSize={orientation === 'horizontal' ? '13rem' : '7.5rem'}
              className="flex min-h-0 min-w-0 overflow-hidden"
            >
              {child.type === 'split'
                ? renderGroup(child, child.children, child.orientation, child.sizes)
                : pane ? <PaneOutlet host={paneHost(pane.paneId)} /> : null}
            </Panel>
          </Fragment>
        );
      })}
    </PaneGroup>
  );

  const workspaceBody = (
    // While a pane is zoomed, the others stay mounted but hidden, keeping their editors' state.
    <div
      ref={workspaceRef}
      data-document-workspace=""
      data-pane-zoomed={zoomedPaneId ? 'true' : undefined}
      className="relative flex min-h-0 min-w-0 flex-1"
    >
      {layout.type === 'split'
        ? renderGroup(layout, layout.children, layout.orientation, layout.sizes)
        : renderGroup(layout, [layout], 'horizontal', [100])}
      {/* Editor ownership stays flat even when the resize tree gains or loses split groups. */}
      {panes.map(pane => createPortal(renderPane(pane), paneHost(pane.paneId).element, `${scopeKey}:${pane.paneId}`))}
      {dropOverlay ? (
        <div
          aria-hidden="true"
          data-drop-preview-kind={dropOverlay.kind}
          data-drop-preview-direction={'direction' in dropOverlay ? dropOverlay.direction : undefined}
          className="workspace-drop-preview pointer-events-none absolute z-30 rounded-lg border-2 border-primary-default bg-primary-soft/35"
          style={{
            '--drop-preview-left': `${dropOverlay.rect.left}px`,
            '--drop-preview-top': `${dropOverlay.rect.top}px`,
            '--drop-preview-width': `${dropOverlay.rect.width}px`,
            '--drop-preview-height': `${dropOverlay.rect.height}px`,
          } as CSSProperties}
        />
      ) : null}
    </div>
  );

  if (!tabsWorkspace) {
    return workspaceBody;
  }

  return (
    <WorkspaceTabDndContext.Provider value={dndContextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={clearDragState}
      >
        {workspaceBody}
        <DragOverlay dropAnimation={null}>
          {draggedTab ? (
            <div className="flex h-7 max-w-56 items-center gap-1.5 rounded-md border border-primary-default/60 bg-background-default px-2.5 text-xs font-medium text-text-default shadow-lg">
              <span className="min-w-0 truncate">{draggedTab.title || 'Untitled'}</span>
              {copyMode ? (
                <span className="shrink-0 rounded bg-primary-soft px-1 py-0.5 text-2xs font-semibold text-primary-default">
                  + Copy
                </span>
              ) : null}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </WorkspaceTabDndContext.Provider>
  );
}
