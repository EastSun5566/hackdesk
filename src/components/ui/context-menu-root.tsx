import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuPortal = ContextMenuPrimitive.Portal;

type ContextMenuTriggerProps = React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Trigger> & {
  asChild?: boolean;
};

const ContextMenuTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Trigger>,
  ContextMenuTriggerProps
>(({ asChild, children, ...props }, ref) => (
  <ContextMenuPrimitive.Trigger
    ref={ref}
    render={asChild && React.isValidElement(children) ? children : undefined}
    {...props}
  >
    {asChild ? undefined : children}
  </ContextMenuPrimitive.Trigger>
));
ContextMenuTrigger.displayName = 'ContextMenuTrigger';

export {
  ContextMenu,
  ContextMenuPortal,
  ContextMenuTrigger,
};
