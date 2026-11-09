import type * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from '@base-ui/react/select';

import { cn } from '@/lib/utils';
import {
  FLOATING_LAYER_CLASS,
  MENU_ITEM_CLASS,
  MENU_POPUP_CLASS,
} from './layers';

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
        'inline-flex h-[34px] min-w-36 items-center justify-between gap-2 rounded border border-border-default bg-transparent px-3 py-1.5 text-sm leading-5 text-text-default transition-colors placeholder:text-text-subtler hover:bg-element-bg-hover focus:border-border-primary-subtler focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-primary-subtler disabled:pointer-events-none disabled:border-element-border-disabled disabled:bg-element-bg-disabled disabled:opacity-65',
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
            MENU_POPUP_CLASS,
            'min-w-[var(--anchor-width)] origin-(--transform-origin) ease-out data-[closed]:ease-in data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none',
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
        MENU_ITEM_CLASS,
        'pr-11',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-5 inline-flex size-4 items-center justify-center text-primary-default">
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
