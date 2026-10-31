import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '@/lib/utils';
import { ELEVATED_SURFACE_CLASS, FLOATING_LAYER_CLASS } from './layers';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

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
          'rounded-md border border-border-default bg-background-default text-text-default outline-none data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none',
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
