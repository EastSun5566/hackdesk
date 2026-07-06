import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';

import { cn } from '@/lib/utils';
import { ELEVATED_SURFACE_CLASS, FLOATING_LAYER_CLASS } from './layers';

type TooltipProviderProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider> & {
  delayDuration?: number;
  skipDelayDuration?: number;
};

function TooltipProvider({
  delayDuration,
  skipDelayDuration,
  delay,
  timeout,
  ...props
}: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider
      delay={delay ?? delayDuration}
      timeout={timeout ?? skipDelayDuration}
      {...props}
    />
  );
}

const TooltipRoot = TooltipPrimitive.Root;

type TooltipTriggerProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> & {
  asChild?: boolean;
};

const TooltipTrigger = React.forwardRef<
  HTMLButtonElement,
  TooltipTriggerProps
>(({ asChild, children, ...props }, ref) => (
  <TooltipPrimitive.Trigger
    ref={ref}
    render={asChild && React.isValidElement(children) ? children : undefined}
    {...props}
  >
    {asChild ? undefined : children}
  </TooltipPrimitive.Trigger>
));
TooltipTrigger.displayName = 'TooltipTrigger';

const TooltipPortal = TooltipPrimitive.Portal;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Popup> & {
    side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Positioner>['side'];
    sideOffset?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Positioner>['sideOffset'];
  }
>(({ className, side, sideOffset = 6, ...props }, ref) => (
  <TooltipPortal>
    <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className={FLOATING_LAYER_CLASS}>
      <TooltipPrimitive.Popup
        ref={ref}
        className={cn(
          'max-w-64 rounded-md border border-border-default bg-text-default px-2 py-1 text-xs text-background-default data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 motion-reduce:animate-none',
          ELEVATED_SURFACE_CLASS,
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Positioner>
  </TooltipPortal>
));
TooltipContent.displayName = 'TooltipContent';

function Tooltip({
  children,
  content,
  side = 'bottom',
}: {
  children: React.ReactElement;
  content: React.ReactNode;
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Positioner>['side'];
}) {
  return (
    <TooltipRoot>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  );
}

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
};
