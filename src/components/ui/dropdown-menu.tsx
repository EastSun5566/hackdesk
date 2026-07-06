import * as React from 'react';
import { Menu as DropdownMenuPrimitive } from '@base-ui/react/menu';

import { cn } from '@/lib/utils';
import { ELEVATED_SURFACE_CLASS, FLOATING_LAYER_CLASS } from './layers';

const DropdownMenu = DropdownMenuPrimitive.Root;

type DropdownMenuTriggerProps = React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger> & {
  asChild?: boolean;
};

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerProps
>(({ asChild, children, onPointerDown, ...props }, ref) => (
  <DropdownMenuPrimitive.Trigger
    ref={ref}
    render={asChild && React.isValidElement(children) ? children : undefined}
    onPointerDown={(event) => {
      onPointerDown?.(event);

      if (
        event.defaultPrevented
        || event.button !== 0
        || event.ctrlKey
        || event.currentTarget.disabled
      ) {
        return;
      }

      event.preventDefault();
      event.currentTarget.click();
    }}
    {...props}
  >
    {asChild ? undefined : children}
  </DropdownMenuPrimitive.Trigger>
));
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Popup> & {
    align?: 'start' | 'center' | 'end';
    side?: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Positioner>['side'];
    sideOffset?: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Positioner>['sideOffset'];
  }
>(({ className, sideOffset = 6, side = 'bottom', align = 'end', ...props }, ref) => (
  <DropdownMenuPortal>
    <DropdownMenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className={FLOATING_LAYER_CLASS}>
      <DropdownMenuPrimitive.Popup
        ref={ref}
        className={cn(
          'min-w-44 overflow-hidden rounded-md border border-border-default bg-background-default p-1 text-text-default data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none',
          ELEVATED_SURFACE_CLASS,
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Positioner>
  </DropdownMenuPortal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

type MenuItemSelectEvent = React.MouseEvent<HTMLElement>;

type DropdownMenuItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>,
  'onClick'
> & {
  destructive?: boolean;
  onClick?: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>['onClick'];
  onSelect?: (event: MenuItemSelectEvent) => void;
};

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(({ className, destructive, onSelect, onClick, closeOnClick = true, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
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
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>, 'onClick'> & {
    onClick?: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>['onClick'];
    onSelect?: (event: MenuItemSelectEvent) => void;
  }
>(({ className, onSelect, closeOnClick = false, onClick, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    closeOnClick={closeOnClick}
    onClick={(event) => {
      onSelect?.(event);
      onClick?.(event);
    }}
    className={cn(
      'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-element-bg-hover data-[highlighted]:text-text-default data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  />
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-2 py-1.5 text-xs font-medium text-text-subtle', className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border-default', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
