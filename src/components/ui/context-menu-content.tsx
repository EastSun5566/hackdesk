import * as React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';

import { cn } from '@/lib/utils';

import { ELEVATED_SURFACE_CLASS, FLOATING_LAYER_CLASS } from './layers';
import { ContextMenuPortal } from './context-menu-root';

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPortal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        'min-w-44 origin-[var(--radix-context-menu-content-transform-origin)] overflow-hidden rounded-md border border-border-default bg-background-default p-1 text-text-default data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none',
        FLOATING_LAYER_CLASS,
        ELEVATED_SURFACE_CLASS,
        className,
      )}
      {...props}
    />
  </ContextMenuPortal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

export { ContextMenuContent };
