import * as React from 'react';
import { Toolbar as ToolbarPrimitive } from '@base-ui/react/toolbar';

import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

const toolbarVariantClassNames = {
  default: '',
  /** A narrow column beside content, such as a collapsed book contents panel. */
  rail: 'border-r border-border-default bg-background-muted p-1.5',
} as const;

const Toolbar = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Root> & { variant?: keyof typeof toolbarVariantClassNames }
>(({ className, variant = 'default', ...props }, ref) => (
  <ToolbarPrimitive.Root
    ref={ref}
    className={cn('flex items-center gap-1', toolbarVariantClassNames[variant], className)}
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

const iconButtonClassName = buttonVariants({ variant: 'ghost', size: 'icon' });

const toolbarButtonVariantClassNames = {
  default: '',
  /** A ghost icon button, the usual toolbar button. */
  icon: iconButtonClassName,
  /** An icon button in the window's title bar, with the larger radius of the tab bar. */
  'icon-topbar': cn(iconButtonClassName, 'rounded-md'),
  /** A small icon button beside text actions, quieter on hover. */
  'icon-subtle': cn(iconButtonClassName, 'text-text-subtle hover:text-text-default'),
  /** An icon button that calls for action, such as Save while there are unsaved changes. */
  'icon-primary': cn(iconButtonClassName, 'bg-primary-solid text-primary-solid-foreground hover:bg-primary-solid-hover hover:text-primary-solid-foreground'),
  /** A window control (minimize, maximize) in the title bar Linux and Windows draw themselves. */
  'window-control': cn(iconButtonClassName, 'rounded-md text-text-subtle hover:text-text-default'),
  /** The close window control: red on hover, as the system's own close button is. */
  'window-close': cn(iconButtonClassName, 'rounded-md text-text-subtle hover:bg-destructive-default hover:text-destructive-foreground'),
  /** A small secondary text button on the page fill, as in a panel header. */
  'text-compact': cn(buttonVariants({ variant: 'secondary', size: 'xs' }), 'h-6 bg-background-default px-2 font-medium'),
} as const;

export type ToolbarButtonVariant = keyof typeof toolbarButtonVariantClassNames;

const ToolbarButton = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Button>,
  React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Button> & { variant?: ToolbarButtonVariant }
>(({ className, type = 'button', variant = 'default', ...props }, ref) => (
  <ToolbarPrimitive.Button
    ref={ref}
    type={type}
    className={cn(
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring data-[disabled]:opacity-50',
      toolbarButtonVariantClassNames[variant],
      className,
    )}
    {...props}
  />
));
ToolbarButton.displayName = 'ToolbarButton';

/**
 * A divider between toolbar items. With `shown`, it keeps its place either way and fades in and out
 * (hidden from assistive tech while out): it fades in after a panel's motion (200ms) has nearly settled
 * and out at once, for a divider that only belongs in one state of a moving layout.
 */
const ToolbarSeparator = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Separator> & { shown?: boolean }
>(({ className, shown, ...props }, ref) => (
  <ToolbarPrimitive.Separator
    ref={ref}
    aria-hidden={shown === false ? true : undefined}
    data-shown={shown === undefined ? undefined : String(shown)}
    className={cn(
      'mx-1 h-5 w-px bg-border-default',
      shown !== undefined && 'transition-opacity ease-out motion-reduce:transition-none',
      shown === true && 'opacity-100 delay-150 duration-150',
      shown === false && 'opacity-0 duration-75',
      className,
    )}
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
