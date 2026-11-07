import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Toast as ToastPrimitive } from '@base-ui/react/toast';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ELEVATED_SURFACE_CLASS, TOAST_LAYER_CLASS } from './layers';

type ToastVariant = 'success' | 'error' | 'info';

type HackDeskToastData = {
  variant: ToastVariant;
};

const TOAST_TIMEOUT_MS: Record<ToastVariant, number> = {
  success: 3500,
  info: 4500,
  error: 7000,
};

export type ToastOptions = {
  description?: React.ReactNode;
  duration?: number;
  priority?: 'low' | 'high';
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
    timeout: options.duration ?? TOAST_TIMEOUT_MS[variant],
    type: variant,
    priority: options.priority ?? 'low',
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
    <ToastPrimitive.Provider toastManager={toastManager} limit={4}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          aria-label="Notifications"
          className={cn(
            'fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 flex w-[min(360px,calc(100vw-2rem))] max-w-full flex-col gap-2 outline-none',
            TOAST_LAYER_CLASS,
          )}
        >
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
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(
              'group pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-border-default/80 bg-background-default/95 p-2.5 text-text-default shadow-[0_18px_45px_rgba(0,0,0,0.22),0_1px_0_rgba(255,255,255,0.04)_inset] backdrop-blur data-[ending-style]:animate-out data-[starting-style]:animate-in data-[ending-style]:fade-out-0 data-[starting-style]:fade-in-0 data-[ending-style]:slide-out-to-bottom-1 data-[starting-style]:slide-in-from-bottom-1 motion-reduce:animate-none',
              ELEVATED_SURFACE_CLASS,
              variant === 'success' && 'border-state-success-border',
              variant === 'error' && 'border-state-danger-border',
              variant === 'info' && 'border-border-primary-subtler',
            )}
          >
            <span
              className={cn(
                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                variant === 'success' && 'bg-state-success-background text-state-success-text',
                variant === 'error' && 'bg-state-danger-bg-light text-state-danger-text',
                variant === 'info' && 'bg-background-primary-subtler text-primary-default',
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
                render={<Button size="sm" variant="primary" className="shrink-0" />}
                className={toastItem.actionProps.className}
              />
            ) : null}
            <ToastPrimitive.Close
              aria-label="Close notification"
              render={<Button size="icon" variant="ghost" className="-mr-1 shrink-0" />}
            >
              <X className="h-3.5 w-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
    </>
  );
}
