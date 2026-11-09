import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';

import { cn } from '@/lib/utils';

import { FLOATING_LAYER_CLASS, MENU_POPUP_CLASS } from './layers';
import { ContextMenuPortal } from './context-menu-root';

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Popup> & {
    align?: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Positioner>['align'];
    side?: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Positioner>['side'];
    sideOffset?: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Positioner>['sideOffset'];
    /** Where the menu opens, for a menu opened without a trigger (a list's shared row menu). */
    anchor?: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Positioner>['anchor'];
  }
>(({ className, align = 'start', side = 'right', sideOffset = 4, anchor, ...props }, ref) => (
  <ContextMenuPortal>
    <ContextMenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} anchor={anchor} className={FLOATING_LAYER_CLASS}>
      <ContextMenuPrimitive.Popup
        ref={ref}
        className={cn(
          MENU_POPUP_CLASS,
          'origin-(--transform-origin) ease-out data-[closed]:ease-in data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Positioner>
  </ContextMenuPortal>
));
ContextMenuContent.displayName = 'ContextMenuContent';

export { ContextMenuContent };
