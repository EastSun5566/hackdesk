import { useRef } from 'react';

import { cn } from '@/lib/utils';

import { GAP_SASH_CLASS } from './ui';

// The gap between two surfaces, with no line of its own: the adjacent surface's border lights up
// instead. Its grip reaches 4px over that border, so the border itself can be grabbed.
const EDGE_SASH_CLASS = 'relative w-1.5 shrink-0 cursor-col-resize border-0 bg-transparent outline-none before:absolute before:inset-y-0 before:left-0 before:-right-1';
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
  edgeSelector,
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
   * Surfaces whose edge this handle is. While it's hovered, focused or dragged, the ones that start
   * at its right edge light that border up (data-sash-edge, see styles.css), so the border itself
   * reads as the handle instead of a separate line in the gap.
   */
  edgeSelector?: string;
}) {
  const dragStart = useRef<{ x: number; value: number; latest: number } | null>(null);
  const engaged = useRef({ hover: false, focus: false, drag: false });
  const markEdges = (sash: HTMLElement) => {
    if (!edgeSelector) return;
    const { hover, focus, drag } = engaged.current;
    const active = hover || focus || drag;
    const edgeX = sash.getBoundingClientRect().right;
    for (const surface of document.querySelectorAll<HTMLElement>(edgeSelector)) {
      const touches = Math.abs(surface.getBoundingClientRect().left - edgeX) < 2;
      if (active && touches) surface.dataset.sashEdge = 'true';
      else delete surface.dataset.sashEdge;
    }
  };
  const engage = (sash: HTMLElement, key: keyof typeof engaged.current, on: boolean) => {
    engaged.current[key] = on;
    markEdges(sash);
  };
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
        edgeSelector ? EDGE_SASH_CLASS : GAP_SASH_CLASS,
        'z-20 h-auto [[data-hack-mode]_&]:hidden',
      )}
      onPointerEnter={(event) => engage(event.currentTarget, 'hover', true)}
      onPointerLeave={(event) => engage(event.currentTarget, 'hover', false)}
      onFocus={(event) => engage(event.currentTarget, 'focus', event.currentTarget.matches(':focus-visible'))}
      onBlur={(event) => engage(event.currentTarget, 'focus', false)}
      onPointerDown={(event) => {
        engage(event.currentTarget, 'drag', true);
        dragStart.current = { x: event.clientX, value, latest: value };
        event.currentTarget.setPointerCapture(event.pointerId);
        // Panels animate their width, except while dragged, so the edge follows the pointer.
        document.documentElement.dataset.panelResizing = 'true';
      }}
      onLostPointerCapture={(event) => {
        delete document.documentElement.dataset.panelResizing;
        engage(event.currentTarget, 'drag', false);
      }}
      onPointerMove={(event) => {
        if (!dragStart.current || event.buttons === 0) {
          return;
        }

        const width = clampPanelWidth(dragStart.current.value + event.clientX - dragStart.current.x, min, max);
        dragStart.current.latest = width;
        if (!preview(width)) onChange(width);
        markEdges(event.currentTarget);
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
