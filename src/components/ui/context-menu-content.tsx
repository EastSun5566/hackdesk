import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';

import { cn } from '@/lib/utils';

import { ELEVATED_SURFACE_CLASS, FLOATING_LAYER_CLASS } from './layers';
import { ContextMenuPortal } from './context-menu-root';

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Popup> & {
    align?: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Positioner>['align'];
    side?: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Positioner>['side'];
    sideOffset?: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Positioner>['sideOffset'];
  }
>(({ className, align = 'start', side = 'right', sideOffset = 4, ...props }, ref) => (
  <ContextMenuPortal>
    <ContextMenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className={FLOATING_LAYER_CLASS}>
      <ContextMenuPrimitive.Popup
        ref={ref}
        className={cn(
          'min-w-44 overflow-hidden rounded-md border border-border-default bg-background-default p-1 text-text-default data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none',
          ELEVATED_SURFACE_CLASS,
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Positioner>
  </ContextMenuPortal>
));
ContextMenuContent.displayName = 'ContextMenuContent';

export { ContextMenuContent };
