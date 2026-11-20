import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ELEVATED_SURFACE_CLASS, OVERLAY_LAYER_CLASS } from './layers';

const Dialog = DialogPrimitive.Root;

const DialogPortal = DialogPrimitive.Portal;

const dialogCloseSizeClassNames = {
  default: 'p-1',
  /** As tall as a field, for a close button at the end of a search input. */
  field: 'inline-flex size-8 items-center justify-center p-0',
} as const;

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close> & { size?: keyof typeof dialogCloseSizeClassNames }
>(({ className, children, size = 'default', ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className={cn(
      'rounded text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-emphasize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none',
      dialogCloseSizeClassNames[size],
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
  default: 'max-w-[600px]',
  // Onboarding and other short, single-column flows.
  sm: 'w-[min(400px,calc(100dvw-2rem))] max-w-[400px]',
  // Searchable lists that grow up to a fixed height and then scroll.
  md: 'flex max-h-[min(760px,calc(100dvh-4rem))] w-[min(720px,calc(100dvw-3rem))] max-w-180 flex-col',
  // Fixed-height layouts with their own scroll regions.
  lg: 'flex h-[min(760px,calc(100dvh-4rem))] w-[min(820px,calc(100dvw-3rem))] max-w-205 flex-col',
  // A landscape window with a sidebar beside its pages, such as Settings: 3:2, like a desktop window.
  wide: 'flex h-[min(640px,calc(100dvh-4rem))] w-[min(960px,calc(100dvw-3rem))] max-w-240 flex-col',
  // Wide, scrolling content.
  xl: 'max-h-[calc(100dvh-4rem)] max-w-4xl overflow-y-auto',
  // Side-by-side comparisons: as wide as the window allows, up to 75rem.
  comparison: 'flex max-h-[calc(100dvh-4rem)] w-[min(75rem,calc(100dvw-3rem))] max-w-300 flex-col overflow-hidden',
  // A comparison with a fixed height, for layouts with their own scroll regions.
  'comparison-tall': 'flex h-[min(760px,calc(100dvh-4rem))] max-h-[calc(100dvh-4rem)] w-[min(75rem,calc(100dvw-3rem))] max-w-300 flex-col overflow-hidden',
} as const;

const dialogLayoutClassNames = {
  default: '',
  // Edge to edge: the dialog's sections bring their own padding and dividers.
  flush: 'gap-0 p-0',
} as const;

const dialogPlacementClassNames = {
  center: '',
  // Pinned near the top so a growing result list does not move the input.
  top: 'mt-[12dvh] self-start',
} as const;

/**
 * Where a dialog that sets no `finalFocus` of its own returns focus when it closes. The workbench
 * points it at the open note's editor. Returning false leaves focus alone (a command the dialog
 * ran is about to move it); null, or no provider, keeps Base UI's default.
 */
const DialogReturnFocusContext = React.createContext<(() => HTMLElement | false | null) | null>(null);
const DialogReturnFocusProvider = DialogReturnFocusContext.Provider;

function useDefaultFinalFocus(popupRef: React.RefObject<HTMLElement | null>) {
  const getReturnTarget = React.useContext(DialogReturnFocusContext);
  return React.useCallback(() => {
    if (!getReturnTarget) return true;
    const active = document.activeElement;
    // A command the dialog ran may already have moved focus somewhere on purpose.
    if (active instanceof HTMLElement && active !== document.body && !active.closest('[role="dialog"], [role="alertdialog"]')) {
      return false;
    }
    // A dialog opened from another one returns into it, as usual.
    const otherOpen = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
      .some((dialog) => dialog !== popupRef.current && !dialog.hasAttribute('data-closed'));
    if (otherOpen) return true;
    return getReturnTarget() ?? true;
  }, [getReturnTarget, popupRef]);
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> & {
    showCloseButton?: boolean;
    size?: keyof typeof dialogSizeClassNames;
    placement?: keyof typeof dialogPlacementClassNames;
    layout?: keyof typeof dialogLayoutClassNames;
  }
>(({ className, children, showCloseButton = true, size = 'default', placement = 'center', layout = 'default', finalFocus, ...props }, ref) => {
  const popupRef = React.useRef<HTMLDivElement | null>(null);
  const setPopupRef = React.useCallback((element: HTMLDivElement | null) => {
    popupRef.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  }, [ref]);
  const defaultFinalFocus = useDefaultFinalFocus(popupRef);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Viewport className={cn('fixed inset-0 grid place-items-center', OVERLAY_LAYER_CLASS)}>
        <DialogPrimitive.Popup
          ref={setPopupRef}
          finalFocus={finalFocus ?? defaultFinalFocus}
          className={cn(
            'relative grid w-full gap-4 rounded-lg border border-border-default bg-background-raised p-5 text-text-default duration-150 ease-out data-[closed]:ease-in data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none',
            ELEVATED_SURFACE_CLASS,
            dialogSizeClassNames[size],
            dialogPlacementClassNames[placement],
            dialogLayoutClassNames[layout],
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton ? <DialogClose className="absolute right-4 top-4" /> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  );
});
DialogContent.displayName = 'DialogContent';

const dialogHeaderVariantClassNames = {
  default: '',
  /** Keeps a long title clear of the close button in the corner. */
  'beside-close': 'pr-8',
  /** The top bar of a `flush` dialog. */
  bar: 'px-5 pb-3 pt-4',
} as const;

const DialogHeader = ({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof dialogHeaderVariantClassNames }) => (
  <div
    className={cn(
      'flex flex-col gap-1.5',
      dialogHeaderVariantClassNames[variant],
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const dialogFooterVariantClassNames = {
  default: '',
  /** A status message on the left, the actions on the right. */
  status: 'items-center justify-between pt-1 sm:justify-between',
  /** The bottom bar of a `flush` dialog. */
  bar: 'border-t border-border-default px-5 py-3',
} as const;

const DialogFooter = ({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof dialogFooterVariantClassNames }) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      dialogFooterVariantClassNames[variant],
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const dialogTitleVariantClassNames = {
  default: '',
  /** An icon before the title text. */
  'with-icon': 'flex items-center gap-2',
} as const;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & { variant?: keyof typeof dialogTitleVariantClassNames }
>(({ className, variant = 'default', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-bold leading-6 text-text-emphasize text-balance',
      dialogTitleVariantClassNames[variant],
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

const dialogDescriptionVariantClassNames = {
  default: '',
  /** One line, cut off with an ellipsis, such as the name of the note a dialog acts on. */
  truncate: 'truncate',
  /** One small line under the title, such as a note name and its status. */
  meta: 'truncate text-xs',
} as const;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & { variant?: keyof typeof dialogDescriptionVariantClassNames }
>(({ className, variant = 'default', ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-text-subtle', dialogDescriptionVariantClassNames[variant], className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogClose,
  DialogReturnFocusProvider,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
