import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { GAP_SASH_CLASS } from './ui';
import { clampPanelWidth } from './ui-preferences';

// A surface's border, with no line or gap of its own: the border lights up instead. It takes no
// width, so the panel before/after it keeps the same inset from the border as from the window's other
// edge. Its 10px grip extends outward into the adjacent surface, clear of scrollbars.
const EDGE_SASH_BASE_CLASS = 'edge-sash relative w-0 shrink-0 cursor-col-resize border-0 bg-transparent outline-none before:absolute before:inset-y-0';
const EDGE_SASH_RIGHT_CLASS = `${EDGE_SASH_BASE_CLASS} before:left-0 before:-right-2.5`;
const EDGE_SASH_LEFT_CLASS = `${EDGE_SASH_BASE_CLASS} before:-left-2.5 before:right-0`;

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
  direction = 'right',
  collapseThreshold,
  onCollapse,
  className,
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
  /** Which side of the panel the handle sits on. Left handles grow the panel when dragged left. */
  direction?: 'left' | 'right';
  /** Dragging past this width marks the handle ready to collapse and calls onCollapse on release. */
  collapseThreshold?: number;
  onCollapse?: () => void;
  className?: string;
}) {
  const [collapseReady, setCollapseReady] = useState(false);
  const dragStart = useRef<{ x: number; value: number; latest: number; collapse: boolean } | null>(null);
  const deltaSign = direction === 'left' ? -1 : 1;

  const preview = (width: number) => {
    const target = previewTargetId ? document.getElementById(previewTargetId) : null;
    if (!target || previewProperties.length === 0) return false;
    for (const property of previewProperties) target.style.setProperty(property, `${width}px`);
    return true;
  };

  const finishDrag = () => {
    delete document.documentElement.dataset.panelResizing;
    const drag = dragStart.current;
    dragStart.current = null;
    setCollapseReady(false);
    if (!drag) return;
    if (drag.collapse && onCollapse) {
      if (previewTargetId) preview(drag.value);
      onCollapse();
      return;
    }
    if (drag.latest !== drag.value && previewTargetId) {
      onChange(drag.latest);
    }
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
      data-edge-side={edge ? direction : undefined}
      data-collapse-ready={collapseReady ? 'true' : undefined}
      title={defaultValue ? `${label}. Double-click to reset.` : label}
      className={cn(
        edge ? (direction === 'left' ? EDGE_SASH_LEFT_CLASS : EDGE_SASH_RIGHT_CLASS) : GAP_SASH_CLASS,
        'z-20 h-auto [[data-hack-mode]_&]:hidden',
        className,
      )}
      onPointerDown={(event) => {
        dragStart.current = { x: event.clientX, value, latest: value, collapse: false };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        // Panels animate their width, except while dragged, so the edge follows the pointer.
        document.documentElement.dataset.panelResizing = 'true';
      }}
      onLostPointerCapture={finishDrag}
      onPointerMove={(event) => {
        if (!dragStart.current || event.buttons === 0) {
          return;
        }

        const rawWidth = dragStart.current.value + (event.clientX - dragStart.current.x) * deltaSign;
        const shouldCollapse = Boolean(onCollapse && collapseThreshold !== undefined && rawWidth <= collapseThreshold);
        if (dragStart.current.collapse !== shouldCollapse) {
          dragStart.current.collapse = shouldCollapse;
          setCollapseReady(shouldCollapse);
        }

        const width = clampPanelWidth(rawWidth, min, max);
        dragStart.current.latest = width;
        if (!preview(width) && !shouldCollapse) onChange(width);
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
          onChange(clampPanelWidth(value - step * deltaSign, min, max));
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onChange(clampPanelWidth(value + step * deltaSign, min, max));
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
