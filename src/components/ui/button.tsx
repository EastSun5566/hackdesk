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
    'border border-primary-solid bg-primary-solid text-primary-solid-foreground',
    'hover:border-primary-solid-hover hover:bg-primary-solid-hover',
    'data-[disabled]:border-primary-solid data-[disabled]:bg-primary-solid data-[disabled]:text-primary-solid-foreground',
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
    'border border-destructive-default bg-destructive-default text-destructive-foreground',
    'hover:border-destructive-hover hover:bg-destructive-hover',
    'data-[disabled]:border-destructive-default data-[disabled]:bg-destructive-default data-[disabled]:text-destructive-foreground',
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
  /** A secondary button for a minor action, such as "Use default icon": subtle text until hovered. */
  'secondary-subtle': cn(
    'border border-border-default bg-transparent text-text-subtle',
    'hover:border-element-border-hover hover:bg-element-bg-hover hover:text-text-default',
  ),
  /** No box, even on hover; only the text brightens. For a link-like action inside running text. */
  bare: 'border border-transparent bg-transparent text-text-subtle hover:text-text-default',
  /** No box, even on hover; for an icon action on a row that already highlights itself. */
  'bare-icon': 'border border-transparent bg-transparent text-icon-default hover:text-text-emphasize',
  /** A key-combination recorder: a secondary button that shows when it is listening for keys
   *  (`data-shortcut-recording`). */
  'shortcut-recorder': cn(
    'border border-border-default bg-transparent px-3 text-text-default',
    'hover:border-element-border-hover hover:bg-element-bg-hover hover:text-text-emphasize',
    'data-[shortcut-recording]:border-focus-ring data-[shortcut-recording]:bg-background-selected',
  ),
  /** The remove button inside a tag chip. */
  'chip-remove': cn(
    'rounded-sm border border-transparent bg-transparent text-text-subtle focus-visible:ring-inset',
    'hover:bg-element-bg-hover hover:text-text-emphasize',
  ),
  /** A document tab's close button: hidden until its `group/tab` is hovered, it is focused, or the
   *  tab is selected (`data-selected`). */
  'tab-close': cn(
    'rounded-sm border border-transparent bg-transparent text-text-subtle opacity-0',
    'hover:bg-background-selected hover:text-text-emphasize',
    'focus-visible:opacity-100 group-hover/tab:opacity-100 data-[selected]:opacity-100',
  ),
} as const;

const buttonSizeClassNames = {
  xs: 'h-7 gap-1.5 px-2 text-xs leading-5',
  sm: 'h-8 gap-1.5 px-2 text-sm leading-5',
  md: 'h-[38px] gap-1.5 px-2.5 text-sm leading-5',
  icon: 'size-8 gap-0 p-0',
  'icon-sm': 'size-6 gap-0 p-0',
  'icon-xs': 'size-5 gap-0 p-0',
  /** A compact text action, such as a comment's Resolve. */
  '2xs': 'h-6 gap-1 px-1.5 text-xs leading-5',
  /** Text height only, for an action that sits inside a line of text. */
  inline: 'h-auto gap-1 px-1 py-0 text-sm leading-5',
  /** A 28px square icon button with a larger radius, as in the tab bar. */
  'icon-md': 'size-7 gap-0 p-0 rounded-md',
} as const;

/** Variants that keep their own look when disabled and only dim. A ghost button has no box at rest,
 *  so it must not gain the disabled fill and border either. */
const filledButtonVariants = new Set<ButtonVariant>(['primary', 'destructive-solid', 'warning', 'ghost', 'bare', 'bare-icon', 'chip-remove', 'tab-close']);

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
