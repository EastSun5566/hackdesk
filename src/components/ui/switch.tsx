import * as React from 'react';
import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border-default bg-background-selected p-px transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring data-[checked]:border-primary-default data-[checked]:bg-primary-default data-[disabled]:pointer-events-none data-[disabled]:opacity-50 motion-reduce:transition-none',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block h-4 w-4 rounded-full bg-background-default shadow-sm transition-transform duration-150 ease-out data-[checked]:translate-x-4 motion-reduce:transition-none" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

export { Switch };
