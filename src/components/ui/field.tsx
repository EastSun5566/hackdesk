import * as React from 'react';
import { Field as FieldPrimitive } from '@base-ui/react/field';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

const fieldInputClassName = 'h-10 w-full rounded-md border border-border-default bg-background-muted px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/70 data-[invalid]:border-destructive-default data-[invalid]:focus:border-destructive-default data-[invalid]:focus-visible:ring-destructive-default/40';

const Field = React.forwardRef<
  React.ElementRef<typeof FieldPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof FieldPrimitive.Root>
>(({ className, ...props }, ref) => (
  <FieldPrimitive.Root
    ref={ref}
    className={cn('space-y-2 text-sm', className)}
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
    className={cn('font-medium text-text-default', className)}
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

const Input = React.forwardRef<
  React.ElementRef<typeof InputPrimitive>,
  React.ComponentPropsWithoutRef<typeof InputPrimitive>
>(({ className, ...props }, ref) => (
  <InputPrimitive
    ref={ref}
    className={cn(fieldInputClassName, className)}
    {...props}
  />
));
Input.displayName = 'Input';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <FieldPrimitive.Control
      render={(
        <textarea
          ref={ref}
          className={cn(fieldInputClassName, 'min-h-20 py-2', className)}
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
