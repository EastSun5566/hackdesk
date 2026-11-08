import { useRef } from 'react';

import { cn } from '@/lib/utils';

import { GAP_SASH_CLASS } from './ui';

// The gap between two surfaces, with no line of its own: the adjacent surface's border lights up
// instead. Its grip reaches 4px over that border, so the border itself can be grabbed.
const EDGE_SASH_CLASS = 'edge-sash relative w-1.5 shrink-0 cursor-col-resize border-0 bg-transparent outline-none before:absolute before:inset-y-0 before:left-0 before:-right-1';
import { clampPanelWidth } from './ui-preferences';

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
}) {
  const dragStart = useRef<{ x: number; value: number; latest: number } | null>(null);
  const preview = (width: number) => {
    const target = previewTargetId ? document.getElementById(previewTargetId) : null;
    if (!target || previewProperties.length === 0) return false;
    for (const property of previewProperties) target.style.setProperty(property, `${width}px`);
    return true;
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
        dragStart.current = { x: event.clientX, value, latest: value };
        event.currentTarget.setPointerCapture(event.pointerId);
        // Panels animate their width, except while dragged, so the edge follows the pointer.
        document.documentElement.dataset.panelResizing = 'true';
      }}
      onLostPointerCapture={() => {
        delete document.documentElement.dataset.panelResizing;
        // A drag that ends without pointerup (pointercancel, a system gesture) still commits the
        // previewed width, or the panel would keep showing a width the app never saved.
        const drag = dragStart.current;
        dragStart.current = null;
        if (drag && drag.latest !== drag.value && previewTargetId) onChange(drag.latest);
      }}
      onPointerMove={(event) => {
        if (!dragStart.current || event.buttons === 0) {
          return;
        }

        const width = clampPanelWidth(dragStart.current.value + event.clientX - dragStart.current.x, min, max);
        dragStart.current.latest = width;
        if (!preview(width)) onChange(width);
      }}
      onPointerUp={() => {
        const drag = dragStart.current;
        dragStart.current = null;
        if (drag && drag.latest !== drag.value && previewTargetId) onChange(drag.latest);
      }}
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
