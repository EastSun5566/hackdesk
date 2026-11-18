import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '@/lib/utils';
import { ELEVATED_SURFACE_CLASS, FLOATING_LAYER_CLASS } from './layers';

const Popover = PopoverPrimitive.Root;
const popoverTriggerVariantClassNames = {
  default: '',
  /** Looks like a form field that opens a picker; `aria-invalid` turns its border red. */
  field: cn(
    'gap-2 rounded border border-border-default bg-transparent px-3 text-left text-sm text-text-default transition-colors aria-[invalid=true]:border-destructive-default',
    'focus-visible:border-border-primary-subtler focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-primary-subtler',
  ),
  /** No box until hovered, such as a switcher in a title bar. */
  ghost: 'gap-2 rounded px-1.5 text-left hover:bg-element-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
} as const;

const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger> & { variant?: keyof typeof popoverTriggerVariantClassNames }
>(({ className, variant = 'default', ...props }, ref) => (
  <PopoverPrimitive.Trigger
    ref={ref}
    className={cn(popoverTriggerVariantClassNames[variant], className)}
    {...props}
  />
));
PopoverTrigger.displayName = 'PopoverTrigger';

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup> & {
    align?: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Positioner>['align'];
    side?: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Positioner>['side'];
    sideOffset?: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Positioner>['sideOffset'];
  }
>(({ className, side = 'bottom', align = 'start', sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className={FLOATING_LAYER_CLASS}>
      <PopoverPrimitive.Popup
        ref={ref}
        className={cn(
          'rounded border border-border-default bg-background-raised text-text-default outline-none origin-(--transform-origin) ease-out data-[closed]:ease-in data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none',
          ELEVATED_SURFACE_CLASS,
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverContent, PopoverTrigger };
