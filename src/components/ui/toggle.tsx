import * as React from 'react';
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';

import { cn } from '@/lib/utils';

const toggleVariantClassNames = {
  secondary:
    'border border-border-default text-text-subtle hover:bg-element-bg-hover hover:text-text-default data-[pressed]:bg-background-selected data-[pressed]:text-text-default data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  ghost:
    'text-text-subtle hover:bg-element-bg-hover hover:text-text-default data-[pressed]:bg-background-selected data-[pressed]:text-text-default data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
} as const;

const toggleSizeClassNames = {
  sm: 'h-8 px-2 text-xs',
  md: 'h-9 px-3 text-sm',
} as const;

type ToggleVariant = keyof typeof toggleVariantClassNames;
type ToggleSize = keyof typeof toggleSizeClassNames;

export type ToggleProps = React.ComponentPropsWithoutRef<typeof TogglePrimitive> & {
  variant?: ToggleVariant;
  size?: ToggleSize;
};

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive>,
  ToggleProps
>(({ className, size = 'md', type = 'button', variant = 'secondary', ...props }, ref) => (
  <TogglePrimitive
    ref={ref}
    type={type}
    className={cn(
      'inline-flex items-center justify-center rounded-md font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring motion-reduce:transition-none',
      toggleSizeClassNames[size],
      toggleVariantClassNames[variant],
      className,
    )}
    {...props}
  />
));
Toggle.displayName = 'Toggle';

export { Toggle };
