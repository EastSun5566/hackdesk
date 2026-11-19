import * as React from 'react';
import { Field as FieldPrimitive } from '@base-ui/react/field';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

const fieldInputClassName = cn(
  'h-[34px] w-full text-ellipsis rounded border border-border-default bg-transparent px-3 py-1.5 text-sm leading-5 text-text-default outline-none transition-[border-color,box-shadow]',
  'placeholder:text-text-subtler',
  'focus:border-border-primary-subtler focus-visible:ring-1 focus-visible:ring-border-primary-subtler',
  'data-[invalid]:border-destructive-default data-[invalid]:focus:border-destructive-default',
  'disabled:pointer-events-none disabled:border-element-border-disabled disabled:bg-element-bg-disabled disabled:opacity-65',
);

const Field = React.forwardRef<
  React.ElementRef<typeof FieldPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof FieldPrimitive.Root>
>(({ className, ...props }, ref) => (
  <FieldPrimitive.Root
    ref={ref}
    className={cn('flex flex-col gap-1.5 text-sm', className)}
    {...props}
  />
));
Field.displayName = 'Field';

const FieldLabel = React.forwardRef<
  React.ElementRef<typeof FieldPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof FieldPrimitive.Label>
>(({ className, ...props }, ref) => (
  <FieldPrimitive.Label
    ref={ref}
    className={cn('text-sm font-semibold leading-5 text-text-default', className)}
    {...props}
  />
));
FieldLabel.displayName = 'FieldLabel';

const FieldDescription = React.forwardRef<
  React.ElementRef<typeof FieldPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof FieldPrimitive.Description>
>(({ className, ...props }, ref) => (
  <FieldPrimitive.Description
    ref={ref}
    className={cn('text-xs leading-5 text-text-subtle', className)}
    {...props}
  />
));
FieldDescription.displayName = 'FieldDescription';

const FieldError = React.forwardRef<
  React.ElementRef<typeof FieldPrimitive.Error>,
  React.ComponentPropsWithoutRef<typeof FieldPrimitive.Error>
>(({ className, ...props }, ref) => (
  <FieldPrimitive.Error
    ref={ref}
    className={cn('text-xs text-destructive-default', className)}
    {...props}
  />
));
FieldError.displayName = 'FieldError';

const inputVariantClassNames = {
  default: '',
  /** Room for a search or other icon placed over the start of the field. */
  'leading-icon': 'pl-8',
  /** Inside a box that draws the border and focus state itself, beside a button. */
  embedded: 'rounded-none border-0 bg-transparent focus:border-transparent focus-visible:ring-0',
  /** A value to copy, such as a link: small, muted text on a muted fill. */
  'read-only': 'bg-background-muted text-xs text-text-subtle',
  /** On the page fill, with tighter padding, beside a colour swatch. */
  filled: 'bg-background-default px-2',
} as const;

export type InputVariant = keyof typeof inputVariantClassNames;

const Input = React.forwardRef<
  React.ElementRef<typeof InputPrimitive>,
  React.ComponentPropsWithoutRef<typeof InputPrimitive> & { variant?: InputVariant }
>(({ className, variant = 'default', ...props }, ref) => (
  <InputPrimitive
    ref={ref}
    className={cn(fieldInputClassName, inputVariantClassNames[variant], className)}
    {...props}
  />
));
Input.displayName = 'Input';

const textareaVariantClassNames = {
  default: '',
  /** On the page fill, with its focus ring inside the box. */
  filled: 'bg-background-default px-2.5 py-2 focus-visible:ring-inset',
} as const;

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: keyof typeof textareaVariantClassNames;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <FieldPrimitive.Control
      render={(
        <textarea
          ref={ref}
          className={cn(fieldInputClassName, 'h-auto min-h-20 py-2', textareaVariantClassNames[variant], className)}
          {...props}
        />
      )}
    />
  ),
);
Textarea.displayName = 'Textarea';

export {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Textarea,
};
