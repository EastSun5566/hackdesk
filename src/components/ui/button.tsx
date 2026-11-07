import * as React from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';

import { cn } from '@/lib/utils';

const focusClassName = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
const pressedClassName = 'active:translate-y-px';

const buttonDisabledBorderedClassName =
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-65 data-[disabled]:bg-element-bg-disabled data-[disabled]:border-element-border-disabled data-[disabled]:text-element-text-disabled';

const buttonDisabledFilledClassName = 'data-[disabled]:pointer-events-none data-[disabled]:opacity-65';

const buttonVariantClassNames = {
  primary: cn(
    'border border-primary-default bg-primary-default text-primary-foreground',
    'hover:border-primary-hover hover:bg-primary-hover',
    'data-[disabled]:border-primary-default data-[disabled]:bg-primary-default data-[disabled]:text-primary-foreground',
  ),
  'outline-primary': cn(
    'border border-primary-default bg-transparent text-primary-default',
    'hover:bg-background-primary-subtler',
  ),
  secondary: cn(
    'border border-border-default bg-transparent text-text-default',
    'hover:border-element-border-hover hover:bg-element-bg-hover hover:text-text-emphasize',
  ),
  ghost: cn(
    'border border-transparent bg-transparent text-text-subtle',
    'hover:bg-element-bg-hover hover:text-text-emphasize',
  ),
  destructive: cn(
    'border border-destructive-default bg-transparent text-destructive-default',
    'hover:bg-destructive-soft',
  ),
  'destructive-solid': cn(
    'border border-destructive-default bg-destructive-default text-white',
    'hover:border-destructive-hover hover:bg-destructive-hover',
    'data-[disabled]:border-destructive-default data-[disabled]:bg-destructive-default data-[disabled]:text-white',
  ),
  warning: cn(
    'border border-warning-default bg-warning-default text-warning-foreground',
    'hover:opacity-90',
    'data-[disabled]:border-warning-default data-[disabled]:bg-warning-default data-[disabled]:text-warning-foreground',
  ),
  'warning-outline': cn(
    'border border-state-warning-border bg-transparent text-text-default',
    'hover:bg-state-warning-background',
  ),
} as const;

const buttonSizeClassNames = {
  xs: 'h-7 gap-1.5 px-2 text-xs leading-5',
  sm: 'h-8 gap-1.5 px-2 text-sm leading-5',
  md: 'h-[38px] gap-1.5 px-2.5 text-sm leading-5',
  icon: 'size-8 gap-0 p-0',
  'icon-sm': 'size-6 gap-0 p-0',
  'icon-xs': 'size-5 gap-0 p-0',
} as const;

const filledButtonVariants = new Set<ButtonVariant>(['primary', 'destructive-solid', 'warning']);

export type ButtonVariant = keyof typeof buttonVariantClassNames;
export type ButtonSize = keyof typeof buttonSizeClassNames;

/** Class names for elements that must look like a Button but render another primitive. */
export function buttonVariants({ variant = 'secondary', size = 'md' }: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cn(
    'inline-flex items-center justify-center rounded border-solid font-normal transition duration-150 ease-out motion-reduce:transition-none',
    focusClassName,
    pressedClassName,
    buttonSizeClassNames[size],
    buttonVariantClassNames[variant],
    filledButtonVariants.has(variant) ? buttonDisabledFilledClassName : buttonDisabledBorderedClassName,
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
