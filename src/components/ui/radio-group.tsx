import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';

import { cn } from '@/lib/utils';

const RadioGroup = RadioGroupPrimitive;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioPrimitive.Root
    ref={ref}
    className={cn(
      'inline-flex h-4 w-4 shrink-0 cursor-default items-center justify-center rounded-full border border-border-default bg-background-default text-primary-default transition-colors data-[checked]:border-primary-default disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-default',
      className,
    )}
    {...props}
  />
));
RadioGroupItem.displayName = 'RadioGroupItem';

const RadioGroupIndicator = React.forwardRef<
  React.ElementRef<typeof RadioPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof RadioPrimitive.Indicator>
>(({ className, ...props }, ref) => (
  <RadioPrimitive.Indicator
    ref={ref}
    className={cn(
      'block h-2 w-2 rounded-full bg-current data-[unchecked]:hidden',
      className,
    )}
    {...props}
  />
));
RadioGroupIndicator.displayName = 'RadioGroupIndicator';

export {
  RadioGroup,
  RadioGroupIndicator,
  RadioGroupItem,
};
