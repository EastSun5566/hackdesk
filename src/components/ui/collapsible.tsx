import * as React from 'react';
import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

import { cn } from '@/lib/utils';

const collapsibleVariantClassNames = {
  default: '',
  /** A section in a stacked list of collapsible sections. */
  section: 'py-0.5',
  /** A small inset box, such as the optional custom values under a form. */
  card: 'rounded-md border border-border-default bg-background-muted px-3 py-2 text-sm',
} as const;

const Collapsible = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Root> & { variant?: keyof typeof collapsibleVariantClassNames }
>(({ className, variant = 'default', ...props }, ref) => (
  <CollapsiblePrimitive.Root ref={ref} className={cn(collapsibleVariantClassNames[variant], className)} {...props} />
));
Collapsible.displayName = 'Collapsible';

const triggerFocusClassName = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

const collapsibleTriggerVariantClassNames = {
  default: '',
  /** The header row of a collapsible section: small caps that highlight as a row on hover. */
  section: cn(
    'gap-2 rounded-md px-2 text-left text-xs font-semibold uppercase text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default',
    triggerFocusClassName,
  ),
  /** A "show more" disclosure inside a form, in body text. */
  disclosure: cn(
    'gap-1.5 rounded px-2 text-left text-sm font-semibold transition-colors hover:bg-background-hover',
    triggerFocusClassName,
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background-default',
  ),
  /** The header of a `card` Collapsible. */
  card: cn('rounded-sm text-left text-xs font-semibold uppercase text-text-subtle', triggerFocusClassName),
} as const;

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> & { variant?: keyof typeof collapsibleTriggerVariantClassNames }
>(({ className, variant = 'default', ...props }, ref) => (
  <CollapsiblePrimitive.Trigger
    ref={ref}
    className={cn('group', collapsibleTriggerVariantClassNames[variant], className)}
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
