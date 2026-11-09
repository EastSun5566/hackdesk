import * as React from 'react';
import { Check } from 'lucide-react';
import { Menu as DropdownMenuPrimitive } from '@base-ui/react/menu';

import { cn } from '@/lib/utils';
import {
  FLOATING_LAYER_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_INDICATOR_CLASS,
  MENU_ITEM_INDICATOR_POSITION_CLASS,
  MENU_LABEL_CLASS,
  MENU_POPUP_CLASS,
  MENU_SEPARATOR_CLASS,
  MENU_SHORTCUT_CLASS,
} from './layers';

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
          MENU_POPUP_CLASS,
          'origin-(--transform-origin) ease-out data-[closed]:ease-in data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none',
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
      MENU_ITEM_CLASS,
      destructive && 'text-destructive-default data-[highlighted]:text-destructive-default [&_svg]:text-destructive-default',
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
>(({ className, children, onSelect, closeOnClick = false, onClick, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    closeOnClick={closeOnClick}
    onClick={(event) => {
      onSelect?.(event);
      onClick?.(event);
    }}
    className={cn(MENU_ITEM_CLASS, MENU_ITEM_INDICATOR_CLASS, className)}
    {...props}
  >
    {children}
    <DropdownMenuPrimitive.CheckboxItemIndicator className={cn(MENU_ITEM_INDICATOR_POSITION_CLASS, 'text-primary-default')}>
      <Check className="h-4 w-4" />
    </DropdownMenuPrimitive.CheckboxItemIndicator>
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(MENU_LABEL_CLASS, className)}
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
    className={cn(MENU_SEPARATOR_CLASS, className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

function DropdownMenuShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(MENU_SHORTCUT_CLASS, className)}
      {...props}
    />
  );
}
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
};
