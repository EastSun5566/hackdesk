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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { MAX_NOTE_PANES } from '@/lib/electron-actions';

import type { NotePane } from './note-workspace';
import type { PaneDirection } from './pane-layout';

export type DropOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DropZonePreview =
  | { kind: 'workspace-edge'; direction: PaneDirection; rect: DropOverlayRect }
  | { kind: 'pane-edge'; paneId: string; direction: PaneDirection; rect: DropOverlayRect }
  | { kind: 'pane-center'; paneId: string; rect: DropOverlayRect };

export type WorkspaceTabDndState = {
  inWorkspaceDnd: boolean;
  activeDragTabId: string | null;
  dropTargetId: string | null;
  dropOverlay: DropZonePreview | null;
  registerWorkspaceElement: (element: HTMLElement | null) => void;
  registerTabRegionElement: (paneId: string, element: HTMLElement | null) => void;
};

const noop = () => {};

export const WorkspaceTabDndContext = createContext<WorkspaceTabDndState>({
  inWorkspaceDnd: false,
  activeDragTabId: null,
  dropTargetId: null,
  dropOverlay: null,
  registerWorkspaceElement: noop,
  registerTabRegionElement: noop,
});

export function useWorkspaceTabDnd() {
  return useContext(WorkspaceTabDndContext);
}

export function tabStripDropId(paneId: string) {
  return `tab-strip:${paneId}`;
}

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

export function computeWorkspaceDropTarget({
  drag,
  copy,
  point,
  over,
  workspaceEl,
  tabRegionEl,
  tabRegionEls,
  panes,
  zoomedPaneId,
}: {
  drag: { tabId: string; sourcePaneId: string } | null;
  copy: boolean;
  point: { x: number; y: number } | null;
  over: Over | null;
  workspaceEl: HTMLElement | null;
  tabRegionEl?: HTMLElement | null;
  tabRegionEls?: Iterable<HTMLElement>;
  panes: readonly NotePane[];
  zoomedPaneId: string | null;
}): { zone: DropZonePreview | null; stripId: string | null } {
  if (!drag || !workspaceEl) return { zone: null, stripId: null };

  const overData = over?.data.current as { type?: string; paneId?: string } | undefined;
  if ((overData?.type === 'tab' || overData?.type === 'tab-strip') && overData.paneId) {
    return { zone: null, stripId: tabStripDropId(overData.paneId) };
  }

  if (!point) {
    return { zone: null, stripId: null };
  }

  const regionList = tabRegionEls
    ? Array.from(tabRegionEls)
    : tabRegionEl
      ? [tabRegionEl]
      : [];
  for (const regionEl of regionList) {
    if (pointInRect(point.x, point.y, regionEl.getBoundingClientRect())) {
      const targetPaneId = regionEl.dataset.documentPaneId;
      return { zone: null, stripId: targetPaneId ? tabStripDropId(targetPaneId) : null };
    }
  }

  const canSplitMore = panes.length < MAX_NOTE_PANES && !zoomedPaneId;
  const workspaceRect = workspaceEl.getBoundingClientRect();

  // Outer workspace perimeter split when multiple panes already exist.
  if (canSplitMore && panes.length > 1 && pointInRect(point.x, point.y, workspaceRect)) {
    const outerMargin = 18;
    const edges: Array<{ direction: PaneDirection; distance: number }> = [
      { direction: 'left', distance: point.x - workspaceRect.left },
      { direction: 'right', distance: workspaceRect.right - point.x },
      { direction: 'up', distance: point.y - workspaceRect.top },
      { direction: 'down', distance: workspaceRect.bottom - point.y },
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
    if (canSplitMore) {
      const candidates: Array<{ direction: PaneDirection; ratio: number }> = [];
      if (point.x - rect.left <= thresholdX) {
        candidates.push({ direction: 'left', ratio: (point.x - rect.left) / Math.max(1, rect.width) });
      }
      if (rect.right - point.x <= thresholdX) {
        candidates.push({ direction: 'right', ratio: (rect.right - point.x) / Math.max(1, rect.width) });
      }
      if (point.y - rect.top <= thresholdY) {
        candidates.push({ direction: 'up', ratio: (point.y - rect.top) / Math.max(1, rect.height) });
      }
      if (rect.bottom - point.y <= thresholdY) {
        candidates.push({ direction: 'down', ratio: (rect.bottom - point.y) / Math.max(1, rect.height) });
      }
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
}

export function WorkspaceTabDndProvider({
  panes,
  activePaneId,
  zoomedPaneId,
  getTabTitle,
  onReorderTab,
  onMoveTabToPane,
  onSplitTabToNewPane,
  children,
}: {
  panes: readonly NotePane[];
  activePaneId: string;
  zoomedPaneId: string | null;
  getTabTitle: (tabId: string) => string;
  onReorderTab: (paneId: string, tabId: string, overTabId: string) => void;
  onMoveTabToPane?: (tabId: string, targetPaneId: string, options?: { overTabId?: string; copy?: boolean }) => void;
  onSplitTabToNewPane?: (tabId: string, target: { paneId?: string; edge?: boolean; direction: PaneDirection }, options?: { copy?: boolean }) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeDrag, setActiveDrag] = useState<{ tabId: string; sourcePaneId: string } | null>(null);
  const [copyMode, setCopyMode] = useState(false);
  const [dropOverlay, setDropOverlay] = useState<DropZonePreview | null>(null);
  const [activeStripDropId, setActiveStripDropId] = useState<string | null>(null);

  const workspaceElRef = useRef<HTMLElement | null>(null);
  const tabRegionElsRef = useRef(new Map<string, HTMLElement>());
  const activeDragRef = useRef<{ tabId: string; sourcePaneId: string } | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const copyModeRef = useRef(false);
  const overRef = useRef<Over | null>(null);
  const dropOverlayRef = useRef<DropZonePreview | null>(null);

  const registerWorkspaceElement = useCallback((element: HTMLElement | null) => {
    workspaceElRef.current = element;
  }, []);

  const registerTabRegionElement = useCallback((paneId: string, element: HTMLElement | null) => {
    if (element) {
      tabRegionElsRef.current.set(paneId, element);
    } else {
      tabRegionElsRef.current.delete(paneId);
    }
  }, []);

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const point = pointerRef.current ?? args.pointerCoordinates;
    const regionEls = Array.from(tabRegionElsRef.current.values());
    if (point && regionEls.length > 0) {
      const hoveredRegion = regionEls.find((regionEl) => pointInRect(point.x, point.y, regionEl.getBoundingClientRect()));
      if (!hoveredRegion) {
        return [];
      }
      const hoveredPaneId = hoveredRegion.dataset.documentPaneId ?? null;
      if (!hoveredPaneId) {
        return [];
      }
      const tabContainers = args.droppableContainers.filter((container) => {
        const data = container.data.current as { type?: string; paneId?: string } | undefined;
        return data?.type === 'tab' && data.paneId === hoveredPaneId;
      });
      const stripContainers = args.droppableContainers.filter((container) => {
        const data = container.data.current as { type?: string; paneId?: string } | undefined;
        return data?.type === 'tab-strip' && data.paneId === hoveredPaneId;
      });
      const tabListEl = hoveredRegion.querySelector<HTMLElement>('[role="tablist"]');
      if (tabContainers.length > 0 && (!tabListEl || point.x <= tabListEl.getBoundingClientRect().right + 16)) {
        return closestCenter({ ...args, droppableContainers: tabContainers });
      }
      if (stripContainers.length > 0) {
        return closestCenter({ ...args, droppableContainers: stripContainers });
      }
      return closestCenter({ ...args, droppableContainers: tabContainers });
    }
    return closestCenter(args);
  }, []);

  const syncDropState = useCallback((
    drag: { tabId: string; sourcePaneId: string } | null,
    copy: boolean,
    point: { x: number; y: number } | null,
    over: Over | null,
  ) => {
    const { zone, stripId } = computeWorkspaceDropTarget({
      drag,
      copy,
      point,
      over,
      workspaceEl: workspaceElRef.current,
      tabRegionEls: tabRegionElsRef.current.values(),
      panes,
      zoomedPaneId,
    });
    dropOverlayRef.current = zone;
    setDropOverlay(zone);
    setActiveStripDropId(stripId);
  }, [panes, zoomedPaneId]);

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
    activeDragRef.current = null;
    setActiveDrag(null);
    setCopyMode(false);
    copyModeRef.current = false;
    setDropOverlay(null);
    dropOverlayRef.current = null;
    setActiveStripDropId(null);
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
    const nextDrag = { tabId, sourcePaneId };
    activeDragRef.current = nextDrag;
    pointerRef.current = initialPoint;
    copyModeRef.current = initialCopy;
    overRef.current = null;
    setCopyMode(initialCopy);
    setActiveDrag(nextDrag);
  }, [activePaneId, panes]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    overRef.current = event.over;
    const drag = activeDragRef.current;
    if (!drag) return;
    syncDropState(drag, copyModeRef.current, pointerRef.current, event.over);
  }, [syncDropState]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    overRef.current = event.over;
    const drag = activeDragRef.current;
    if (!drag) return;
    syncDropState(drag, copyModeRef.current, pointerRef.current, event.over);
  }, [syncDropState]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const drag = activeDragRef.current;
    if (!drag) {
      clearDragState();
      return;
    }
    const finalCopy = copyModeRef.current || Boolean((event.activatorEvent as MouseEvent | PointerEvent | undefined)?.altKey);
    const zone = dropOverlayRef.current;
    const { tabId, sourcePaneId } = drag;
    clearDragState();

    const { over } = event;
    const overData = over?.data.current as { type?: string; paneId?: string; tabId?: string } | undefined;
    if (overData?.type === 'tab' && overData.paneId) {
      const overTabId = overData.tabId ?? String(over?.id);
      if (overData.paneId === sourcePaneId && !finalCopy) {
        if (tabId !== overTabId) onReorderTab(sourcePaneId, tabId, overTabId);
      } else {
        onMoveTabToPane?.(tabId, overData.paneId, { overTabId, copy: finalCopy });
      }
      return;
    }
    if (overData?.type === 'tab-strip' && overData.paneId) {
      if (overData.paneId !== sourcePaneId || finalCopy) {
        onMoveTabToPane?.(tabId, overData.paneId, { copy: finalCopy });
      }
      return;
    }

    if (zone) {
      if (zone.kind === 'workspace-edge') {
        onSplitTabToNewPane?.(tabId, { edge: true, direction: zone.direction }, { copy: finalCopy });
        return;
      }
      if (zone.kind === 'pane-edge') {
        onSplitTabToNewPane?.(tabId, { paneId: zone.paneId, direction: zone.direction }, { copy: finalCopy });
        return;
      }
      if (zone.kind === 'pane-center') {
        onMoveTabToPane?.(tabId, zone.paneId, { copy: finalCopy });
        return;
      }
    }

    if (!over) return;
    if (String(event.active.id) !== String(over.id)) {
      const fallbackOverPane = panes.find((candidate) => candidate.tabIds.includes(String(over.id)))?.paneId;
      if (fallbackOverPane && (fallbackOverPane !== sourcePaneId || finalCopy)) {
        onMoveTabToPane?.(tabId, fallbackOverPane, { overTabId: String(over.id), copy: finalCopy });
      } else {
        onReorderTab(sourcePaneId, tabId, String(over.id));
      }
    }
  }, [clearDragState, onMoveTabToPane, onReorderTab, onSplitTabToNewPane, panes]);

  const contextValue = useMemo<WorkspaceTabDndState>(() => ({
    inWorkspaceDnd: true,
    activeDragTabId: activeDrag?.tabId ?? null,
    dropTargetId: activeStripDropId,
    dropOverlay,
    registerWorkspaceElement,
    registerTabRegionElement,
  }), [activeDrag?.tabId, activeStripDropId, dropOverlay, registerTabRegionElement, registerWorkspaceElement]);

  const draggedTitle = activeDrag ? getTabTitle(activeDrag.tabId) : null;

  return (
    <WorkspaceTabDndContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={clearDragState}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="flex h-8 max-w-56 items-center gap-1.5 rounded-md border border-primary-default/60 bg-background-default px-2.5 text-sm font-medium text-text-default shadow-lg">
              <span className="min-w-0 truncate">{draggedTitle || 'Untitled'}</span>
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
