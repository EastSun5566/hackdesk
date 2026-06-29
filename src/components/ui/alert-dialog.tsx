import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';

import { cn } from '@/lib/utils';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { ELEVATED_SURFACE_CLASS, OVERLAY_LAYER_CLASS } from './layers';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 bg-background-overlay data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 motion-reduce:animate-none',
      OVERLAY_LAYER_CLASS,
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = 'AlertDialogOverlay';

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Popup>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Viewport className={cn('fixed inset-0 grid place-items-center', OVERLAY_LAYER_CLASS)}>
      <AlertDialogPrimitive.Popup
        ref={ref}
        className={cn(
          'grid w-full max-w-md gap-4 border border-border-default bg-background-default p-6 text-text-default duration-150 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none sm:rounded-md',
          ELEVATED_SURFACE_CLASS,
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Viewport>
  </AlertDialogPortal>
));
AlertDialogContent.displayName = 'AlertDialogContent';

const AlertDialogHeader = DialogHeader;

const AlertDialogFooter = DialogFooter;

const AlertDialogTitle = DialogTitle;

const AlertDialogDescription = DialogDescription;

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Close>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Close ref={ref} className={className} {...props} />
));
AlertDialogCancel.displayName = 'AlertDialogCancel';

const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={className} {...props} />
));
AlertDialogAction.displayName = 'AlertDialogAction';

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
};
