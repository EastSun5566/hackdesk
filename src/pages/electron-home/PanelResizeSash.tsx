import { useRef } from 'react';

import { clampPanelWidth } from './ui-preferences';

export function PanelResizeSash({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const dragStart = useRef<{ x: number; value: number } | null>(null);

  if (disabled) {
    return null;
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      className="group relative z-20 w-1 shrink-0 cursor-col-resize bg-transparent outline-none"
      onPointerDown={(event) => {
        dragStart.current = { x: event.clientX, value };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragStart.current || event.buttons === 0) {
          return;
        }

        onChange(clampPanelWidth(dragStart.current.value + event.clientX - dragStart.current.x, min, max));
      }}
      onPointerUp={() => {
        dragStart.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onChange(clampPanelWidth(value - 16, min, max));
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onChange(clampPanelWidth(value + 16, min, max));
        }
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary-default group-focus-visible:bg-primary-default" />
    </div>
  );
}
