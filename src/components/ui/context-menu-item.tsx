import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';

import { cn } from '@/lib/utils';

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
      'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-element-bg-hover data-[highlighted]:text-text-default data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      destructive && 'text-destructive-default data-[highlighted]:text-destructive-default',
      className,
    )}
    {...props}
  />
));
ContextMenuItem.displayName = 'ContextMenuItem';

export { ContextMenuItem };
