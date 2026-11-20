import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import { GAP_SASH_CLASS } from './ui';

// A surface's border, with no line or gap of its own: the border lights up instead. It takes no
// width, so the panel before it keeps the same inset from the border as from the window's other
// edge. Its 10px grip extends into the next surface, clear of the sidebar's scrollbar.
const EDGE_SASH_CLASS = 'edge-sash relative w-0 shrink-0 cursor-col-resize border-0 bg-transparent outline-none before:absolute before:inset-y-0 before:left-0 before:-right-2.5';
import {
  readSnapMemory,
  recordSnapSample,
  SNAP_RELEASE_DELAY_MS,
  snapWidth,
  writeSnapMemory,
} from './panel-snap-point';
import { clampPanelWidth } from './ui-preferences';

type Drag = {
  /** The pointer x and panel width the drag measures from; a snap release moves them. */
  originX: number;
  originValue: number;
  /** The width when the drag started. */
  startValue: number;
  latest: number;
  lastX: number;
  snapPoint: number | null;
  /** Pausing on the snap point turned snapping off for the rest of this drag. */
  snapReleased: boolean;
};

export function PanelResizeSash({
  label,
  value,
  min,
  max,
  defaultValue,
  disabled,
  onChange,
  previewTargetId,
  previewProperties = [],
  edge = false,
  snapMemoryKey,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  /**
   * While dragging, the handle sets these CSS variables (in px) on this element directly and calls
   * onChange once on release. Updating app state on every pointer move re-rendered the workbench
   * each frame.
   */
  previewTargetId?: string;
  previewProperties?: string[];
  /**
   * The handle sits against a surface's border: it lights that border up while hovered, focused or
   * dragged (.edge-sash in styles.css) instead of drawing a line in the gap.
   */
  edge?: boolean;
  /**
   * Learn the width this panel keeps being dragged to, kept under this storage key, and snap a
   * drag to it (panel-snap-point.ts). The keyboard never snaps.
   */
  snapMemoryKey?: string;
}) {
  const dragStart = useRef<Drag | null>(null);
  const snapReleaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearSnapReleaseTimer = () => {
    clearTimeout(snapReleaseTimer.current);
    snapReleaseTimer.current = undefined;
  };
  useEffect(() => () => clearTimeout(snapReleaseTimer.current), []);
  const preview = (width: number) => {
    const target = previewTargetId ? document.getElementById(previewTargetId) : null;
    if (!target || previewProperties.length === 0) return false;
    for (const property of previewProperties) target.style.setProperty(property, `${width}px`);
    return true;
  };
  // Ends a drag, whether by pointerup or a lost capture (pointercancel, a system gesture).
  const finishDrag = () => {
    clearSnapReleaseTimer();
    const drag = dragStart.current;
    dragStart.current = null;
    // A click without movement is not a width the user chose.
    if (!drag || drag.latest === drag.startValue) return;
    if (snapMemoryKey) writeSnapMemory(snapMemoryKey, recordSnapSample(readSnapMemory(snapMemoryKey), drag.latest));
    if (previewTargetId) onChange(drag.latest);
  };

  if (disabled) {
    return null;
  }

  const resizeLabel = `${label}. Current width ${value}px. Use arrow keys to resize.${
    defaultValue ? ' Press Enter or Space to reset.' : ''
  }`;

  return (
    <button
      type="button"
      aria-label={resizeLabel}
      title={defaultValue ? `${label}. Double-click to reset.` : label}
      className={cn(
        edge ? EDGE_SASH_CLASS : GAP_SASH_CLASS,
        'z-20 h-auto [[data-hack-mode]_&]:hidden',
      )}
      onPointerDown={(event) => {
        dragStart.current = {
          originX: event.clientX,
          originValue: value,
          startValue: value,
          latest: value,
          lastX: event.clientX,
          snapPoint: snapMemoryKey ? readSnapMemory(snapMemoryKey).point : null,
          snapReleased: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        // Panels animate their width, except while dragged, so the edge follows the pointer.
        document.documentElement.dataset.panelResizing = 'true';
      }}
      onLostPointerCapture={() => {
        delete document.documentElement.dataset.panelResizing;
        // A drag that ends without pointerup still commits the previewed width, or the panel would
        // keep showing a width the app never saved.
        finishDrag();
      }}
      onPointerMove={(event) => {
        const drag = dragStart.current;
        if (!drag || event.buttons === 0) {
          return;
        }

        drag.lastX = event.clientX;
        const pointerWidth = clampPanelWidth(drag.originValue + event.clientX - drag.originX, min, max);
        const width = drag.snapReleased ? pointerWidth : clampPanelWidth(snapWidth(pointerWidth, drag.snapPoint), min, max);
        clearSnapReleaseTimer();
        if (width !== pointerWidth) {
          // The edge sticks to the snap point while the pointer moves on. If the pointer rests here,
          // let go: the edge then follows the pointer from the snap point, so it doesn't jump.
          snapReleaseTimer.current = setTimeout(() => {
            snapReleaseTimer.current = undefined;
            if (dragStart.current !== drag) return;
            drag.snapReleased = true;
            drag.originX = drag.lastX;
            drag.originValue = drag.latest;
          }, SNAP_RELEASE_DELAY_MS);
        }
        drag.latest = width;
        if (!preview(width)) onChange(width);
      }}
      onPointerUp={finishDrag}
      onDoubleClick={() => {
        if (defaultValue) {
          onChange(clampPanelWidth(defaultValue, min, max));
        }
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16;

        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onChange(clampPanelWidth(value - step, min, max));
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onChange(clampPanelWidth(value + step, min, max));
        }

        if (event.key === 'Home') {
          event.preventDefault();
          onChange(min);
        }

        if (event.key === 'End') {
          event.preventDefault();
          onChange(max);
        }

        if ((event.key === 'Enter' || event.key === ' ') && defaultValue) {
          event.preventDefault();
          onChange(clampPanelWidth(defaultValue, min, max));
        }
      }}
    />
  );
}
