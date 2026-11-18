import { Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type NumberStepperProps = {
  /** Names the field and its buttons ("Decrease …", "Increase …"). */
  label: string;
  /** The typed text, so a half-typed or invalid number stays as typed. */
  value: string;
  min: number;
  max: number;
  error: string | null;
  errorId?: string;
  onChange: (value: string) => void;
};

/** An integer field between a decrease and an increase button, inside one bordered box. */
export function NumberStepper({ label, value, min, max, error, errorId, onChange }: NumberStepperProps) {
  const parsed = Number(value);
  const step = (delta: number) => {
    const base = Number.isInteger(parsed) ? parsed : delta > 0 ? min : max;
    onChange(String(Math.min(max, Math.max(min, base + delta))));
  };

  return (
    <div
      className={cn(
        'flex h-8.5 shrink-0 items-center rounded border bg-transparent text-sm text-text-default',
        error ? 'border-destructive-default' : 'border-border-default',
      )}
    >
      <Button type="button" variant="ghost" size="icon" className="h-full w-7 rounded-r-none" aria-label={`Decrease ${label.toLowerCase()}`} disabled={Number.isInteger(parsed) && parsed <= min} onClick={() => step(-1)}>
        <Minus aria-hidden="true" className="size-3.5" />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(event) => onChange(event.target.value)}
        className="no-spinner h-full w-9 bg-transparent text-center tabular-nums outline-none focus-visible:bg-background-hover"
        autoComplete="off"
      />
      <Button type="button" variant="ghost" size="icon" className="h-full w-7 rounded-l-none" aria-label={`Increase ${label.toLowerCase()}`} disabled={Number.isInteger(parsed) && parsed >= max} onClick={() => step(1)}>
        <Plus aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}
