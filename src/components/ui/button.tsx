import * as React from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';

import { cn } from '@/lib/utils';

const focusClassName = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
const pressedClassName = 'active:translate-y-px';
const disabledClassName = 'disabled:pointer-events-none disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

const buttonVariantClassNames = {
  primary: 'bg-primary-default text-primary-foreground hover:bg-primary-hover',
  secondary:
    'border border-border-default bg-background-default text-text-default hover:bg-element-bg-hover active:bg-background-selected',
  ghost: 'text-text-subtle hover:bg-element-bg-hover hover:text-text-default',
  destructive: 'border border-destructive-default text-destructive-default hover:bg-destructive-soft',
  'destructive-solid': 'bg-destructive-default text-destructive-foreground hover:bg-destructive-hover',
  warning: 'bg-warning-default text-warning-foreground hover:opacity-90',
  'warning-outline':
    'border border-warning-default/35 bg-background-default text-text-default hover:bg-background-selected',
} as const;

const buttonSizeClassNames = {
  xs: 'h-7 gap-1 px-2 text-xs',
  sm: 'h-8 gap-2 px-2 text-xs',
  md: 'h-9 gap-2 px-3 text-sm',
  icon: 'size-8 p-0',
  'icon-sm': 'size-6 p-0',
  'icon-xs': 'size-5 p-0',
} as const;

export type ButtonVariant = keyof typeof buttonVariantClassNames;
export type ButtonSize = keyof typeof buttonSizeClassNames;

/** Class names for elements that must look like a Button but render another primitive. */
export function buttonVariants({ variant = 'secondary', size = 'md' }: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-md font-medium transition duration-150 ease-out motion-reduce:transition-none',
    focusClassName,
    pressedClassName,
    disabledClassName,
    buttonSizeClassNames[size],
    buttonVariantClassNames[variant],
  );
}

export type ButtonProps = React.ComponentPropsWithoutRef<typeof ButtonPrimitive> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const Button = React.forwardRef<
  React.ElementRef<typeof ButtonPrimitive>,
  ButtonProps
>(({ className, size = 'md', type = 'button', variant = 'secondary', ...props }, ref) => (
  <ButtonPrimitive
    ref={ref}
    type={type}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
));
Button.displayName = 'Button';

export { Button };
