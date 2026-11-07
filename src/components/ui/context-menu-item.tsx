import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';

import { cn } from '@/lib/utils';
import { MENU_ITEM_CLASS } from './layers';

type ContextMenuItemSelectEvent = React.MouseEvent<HTMLElement>;

type ContextMenuItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>,
  'onClick'
> & {
  destructive?: boolean;
  onClick?: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>['onClick'];
  onSelect?: (event: ContextMenuItemSelectEvent) => void;
};

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  ContextMenuItemProps
>(({ className, destructive, onSelect, onClick, closeOnClick = true, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    closeOnClick={closeOnClick}
    onClick={(event) => {
      onSelect?.(event);
      onClick?.(event);
    }}
    className={cn(
      MENU_ITEM_CLASS,
      destructive && 'text-destructive-default data-[highlighted]:text-destructive-default [&_svg]:text-destructive-default',
      className,
    )}
    {...props}
  />
));
ContextMenuItem.displayName = 'ContextMenuItem';

export { ContextMenuItem };
