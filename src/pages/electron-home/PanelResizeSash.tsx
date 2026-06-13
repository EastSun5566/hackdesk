import { useRef } from 'react';

import { clampPanelWidth } from './ui-preferences';

export function PanelResizeSash({
  label,
  value,
  min,
  max,
  defaultValue,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue?: number;
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
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      title={defaultValue ? `${label}. Double-click to reset.` : label}
      className="group relative z-20 w-2 shrink-0 cursor-col-resize bg-transparent outline-none"
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
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-default/50 transition-colors group-hover:bg-primary-default group-focus-visible:bg-primary-default motion-reduce:transition-none" />
    </div>
  );
}
