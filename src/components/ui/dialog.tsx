import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ELEVATED_SURFACE_CLASS, OVERLAY_LAYER_CLASS } from './layers';

const Dialog = DialogPrimitive.Root;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className={cn(
      'rounded-sm p-1 text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none',
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <X aria-hidden="true" className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </>
    )}
  </DialogPrimitive.Close>
));
DialogClose.displayName = 'DialogClose';

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 bg-background-overlay ease-out data-[closed]:ease-in data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 motion-reduce:animate-none',
      OVERLAY_LAYER_CLASS,
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

const dialogSizeClassNames = {
  default: 'max-w-lg',
  // Onboarding and other short, single-column flows.
  sm: 'w-[min(440px,calc(100dvw-2rem))]',
  // Searchable lists that grow up to a fixed height and then scroll.
  md: 'flex max-h-[min(760px,calc(100dvh-4rem))] w-[min(720px,calc(100dvw-3rem))] max-w-180 flex-col',
  // Fixed-height layouts with their own scroll regions, such as Settings.
  lg: 'flex h-[min(760px,calc(100dvh-4rem))] w-[min(820px,calc(100dvw-3rem))] max-w-205 flex-col',
  // Wide, scrolling content such as side-by-side comparisons.
  xl: 'max-h-[calc(100dvh-4rem)] max-w-4xl overflow-y-auto',
} as const;

const dialogPlacementClassNames = {
  center: '',
  // Pinned near the top so a growing result list does not move the input.
  top: 'mt-[12dvh] self-start',
} as const;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> & {
    showCloseButton?: boolean;
    size?: keyof typeof dialogSizeClassNames;
    placement?: keyof typeof dialogPlacementClassNames;
  }
>(({ className, children, showCloseButton = true, size = 'default', placement = 'center', ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Viewport className={cn('fixed inset-0 grid place-items-center', OVERLAY_LAYER_CLASS)}>
      <DialogPrimitive.Popup
        ref={ref}
        className={cn(
          'relative grid w-full gap-4 border border-border-default bg-background-default p-6 text-text-default duration-150 ease-out data-[closed]:ease-in data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none sm:rounded-md',
          ELEVATED_SURFACE_CLASS,
          dialogSizeClassNames[size],
          dialogPlacementClassNames[placement],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? <DialogClose className="absolute right-4 top-4" /> : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Viewport>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none text-balance',
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-text-subtle', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
