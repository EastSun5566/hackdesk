import * as React from 'react';
import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

import { cn } from '@/lib/utils';

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Trigger
    ref={ref}
    className={cn('group', className)}
    {...props}
  />
));
CollapsibleTrigger.displayName = 'CollapsibleTrigger';

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Panel>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Panel>
>(({ className, keepMounted = true, ...props }, ref) => (
  <CollapsiblePrimitive.Panel
    ref={ref}
    keepMounted={keepMounted}
    className={cn(
      "h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-150 ease-out [&[hidden]:not([hidden='until-found'])]:hidden data-[starting-style]:h-0 data-[ending-style]:h-0 data-[closed]:opacity-0 motion-reduce:transition-none",
      className,
    )}
    {...props}
  />
));
CollapsibleContent.displayName = 'CollapsibleContent';

export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
};
