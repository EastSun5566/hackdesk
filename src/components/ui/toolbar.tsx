import * as React from 'react';
import { Toolbar as ToolbarPrimitive } from '@base-ui/react/toolbar';

import { cn } from '@/lib/utils';

const Toolbar = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToolbarPrimitive.Root
    ref={ref}
    className={cn('flex items-center gap-1', className)}
    {...props}
  />
));
Toolbar.displayName = 'Toolbar';

const ToolbarGroup = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Group>
>(({ className, ...props }, ref) => (
  <ToolbarPrimitive.Group
    ref={ref}
    className={cn('flex items-center gap-1', className)}
    {...props}
  />
));
ToolbarGroup.displayName = 'ToolbarGroup';

const ToolbarButton = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Button>,
  React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Button>
>(({ className, type = 'button', ...props }, ref) => (
  <ToolbarPrimitive.Button
    ref={ref}
    type={type}
    className={cn(
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  />
));
ToolbarButton.displayName = 'ToolbarButton';

const ToolbarSeparator = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ToolbarPrimitive.Separator
    ref={ref}
    className={cn('mx-1 h-5 w-px bg-border-default', className)}
    {...props}
  />
));
ToolbarSeparator.displayName = 'ToolbarSeparator';

export {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
};
