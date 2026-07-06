import * as React from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';

import { cn } from '@/lib/utils';

const focusClassName = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
const pressedClassName = 'active:translate-y-px';

const buttonVariantClassNames = {
  primary:
    'bg-primary-default text-primary-foreground hover:bg-primary-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  secondary:
    'border border-border-default bg-background-default text-text-default hover:bg-element-bg-hover active:bg-background-selected data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  ghost:
    'text-text-subtle hover:bg-element-bg-hover hover:text-text-default data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  icon:
    'text-text-subtle hover:bg-element-bg-hover hover:text-text-default data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  destructive:
    'border border-destructive-default text-destructive-default hover:bg-destructive-soft data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
} as const;

const buttonSizeClassNames = {
  sm: 'h-8 gap-2 px-2 text-xs',
  md: 'h-9 gap-2 px-3 text-sm',
  icon: 'h-8 w-8 p-0',
} as const;

type ButtonVariant = keyof typeof buttonVariantClassNames;
type ButtonSize = keyof typeof buttonSizeClassNames;

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
    className={cn(
      'inline-flex items-center justify-center rounded-md font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out motion-reduce:transition-none',
      focusClassName,
      pressedClassName,
      buttonSizeClassNames[size],
      buttonVariantClassNames[variant],
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';

export { Button };
