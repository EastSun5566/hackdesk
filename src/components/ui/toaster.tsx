import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Toast as ToastPrimitive } from '@base-ui/react/toast';

import { cn } from '@/lib/utils';
import { ELEVATED_SURFACE_CLASS } from './layers';

type ToastVariant = 'success' | 'error' | 'info';

type HackDeskToastData = {
  variant: ToastVariant;
};

export type ToastOptions = {
  description?: React.ReactNode;
  duration?: number;
  action?: {
    label: React.ReactNode;
    onClick: () => void;
  };
};

const toastManager = ToastPrimitive.createToastManager<HackDeskToastData>();

function addToast(variant: ToastVariant, title: React.ReactNode, options: ToastOptions = {}) {
  return toastManager.add({
    title,
    description: options.description,
    timeout: options.duration,
    type: variant,
    priority: variant === 'error' ? 'high' : 'low',
    data: { variant },
    actionProps: options.action
      ? {
        children: options.action.label,
        onClick: options.action.onClick,
      }
      : undefined,
  });
}

export const toast = {
  success: (title: React.ReactNode, options?: ToastOptions) => addToast('success', title, options),
  error: (title: React.ReactNode, options?: ToastOptions) => addToast('error', title, options),
  info: (title: React.ReactNode, options?: ToastOptions) => addToast('info', title, options),
  dismiss: (toastId?: string) => toastManager.close(toastId),
};

export function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={toastManager}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="fixed right-4 top-[calc(env(safe-area-inset-top)+3.5rem)] z-50 flex w-[min(360px,calc(100vw-2rem))] max-w-full flex-col gap-2 outline-none">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager<HackDeskToastData>();

  return (
    <>
      {toasts.map((toastItem) => {
        const variant = toastItem.data?.variant ?? toastItem.type;
        const Icon = variant === 'success'
          ? CheckCircle2
          : variant === 'error'
            ? AlertCircle
            : Info;

        return (
          <ToastPrimitive.Root
            key={toastItem.id}
            toast={toastItem}
            className={cn(
              'group pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border border-border-default/80 bg-background-default/95 px-3 py-2.5 text-text-default shadow-[0_18px_45px_rgba(0,0,0,0.22),0_1px_0_rgba(255,255,255,0.04)_inset] backdrop-blur data-[ending-style]:animate-out data-[starting-style]:animate-in data-[ending-style]:fade-out-0 data-[starting-style]:fade-in-0 data-[ending-style]:slide-out-to-top-1 data-[starting-style]:slide-in-from-top-1 motion-reduce:animate-none',
              ELEVATED_SURFACE_CLASS,
              variant === 'success' && 'border-success-default/30',
              variant === 'error' && 'border-destructive-default/35',
              variant === 'info' && 'border-primary-default/25',
            )}
          >
            <span
              className={cn(
                'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                variant === 'success' && 'bg-success-soft text-success-default',
                variant === 'error' && 'bg-destructive-soft text-destructive-default',
                variant === 'info' && 'bg-primary-soft text-primary-default',
              )}
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <ToastPrimitive.Content className="min-w-0 flex-1">
              {toastItem.title ? (
                <ToastPrimitive.Title className="text-sm font-medium leading-5 text-text-default">
                  {toastItem.title}
                </ToastPrimitive.Title>
              ) : null}
              {toastItem.description ? (
                <ToastPrimitive.Description className="mt-0.5 text-xs leading-5 text-text-subtle">
                  {toastItem.description}
                </ToastPrimitive.Description>
              ) : null}
            </ToastPrimitive.Content>
            {toastItem.actionProps ? (
              <ToastPrimitive.Action
                {...toastItem.actionProps}
                className={cn(
                  'inline-flex h-7 shrink-0 items-center justify-center rounded-md bg-primary-default px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-default',
                  toastItem.actionProps.className,
                )}
              />
            ) : null}
            <ToastPrimitive.Close className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-default">
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Close notification</span>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
    </>
  );
}
