import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { Check, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

/** A checkbox. Pass `indeterminate` for a "some selected" parent such as Select all. */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, indeterminate, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    indeterminate={indeterminate}
    className={cn(
      'inline-flex size-4 shrink-0 cursor-default items-center justify-center rounded-sm border border-border-default bg-background-default text-primary-foreground transition-colors',
      'data-[checked]:border-primary-default data-[checked]:bg-primary-default data-[indeterminate]:border-primary-default data-[indeterminate]:bg-primary-default',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-default',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      {indeterminate
        ? <Minus aria-hidden="true" className="size-3" strokeWidth={3} />
        : <Check aria-hidden="true" className="size-3" strokeWidth={3} />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
