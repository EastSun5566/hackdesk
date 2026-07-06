import type * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from '@base-ui/react/select';

import { cn } from '@/lib/utils';
import { ELEVATED_SURFACE_CLASS, FLOATING_LAYER_CLASS } from './layers';

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

function SelectLabelValue({
  labels,
  placeholder,
  value,
}: {
  labels: Readonly<Record<string, React.ReactNode>>;
  value: string | null | undefined;
  placeholder?: React.ReactNode;
}) {
  return (
    <SelectValue placeholder={placeholder}>
      {(selectedValue: unknown) => {
        const currentValue = typeof selectedValue === 'string' ? selectedValue : value;
        if (currentValue != null && Object.prototype.hasOwnProperty.call(labels, currentValue)) {
          return labels[currentValue];
        }

        return placeholder ?? null;
      }}
    </SelectValue>
  );
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'inline-flex h-9 min-w-36 items-center justify-between gap-2 rounded-md border border-border-default bg-background-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-text-subtle">
        <ChevronDown className="h-4 w-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  side = 'bottom',
  align = 'start',
  sideOffset = 6,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Popup> & {
  align?: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Positioner>['align'];
  side?: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Positioner>['side'];
  sideOffset?: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Positioner>['sideOffset'];
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        className={FLOATING_LAYER_CLASS}
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            'min-w-[var(--anchor-width)] overflow-hidden rounded-md border border-border-default bg-background-default p-1 text-text-default data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none',
            ELEVATED_SURFACE_CLASS,
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List>
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 pr-8 text-sm outline-none transition-colors data-[highlighted]:bg-element-bg-hover data-[highlighted]:text-text-default data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center justify-center text-primary-default">
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectLabelValue,
  SelectTrigger,
  SelectValue,
};
