import { useSyncExternalStore } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ConfirmDialogOptions, ConfirmDialogResult } from '@/lib/electron-api';

type PendingConfirm = { options: ConfirmDialogOptions; resolve: (result: ConfirmDialogResult) => void };

let queue: PendingConfirm[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getCurrent = () => queue[0] ?? null;

/**
 * Asks a yes/no question in the app's own dialog (not the system one), so it matches the app and
 * stays inside the window. Requests queue: one dialog at a time, in order.
 */
export function confirmDialog(options: ConfirmDialogOptions): Promise<ConfirmDialogResult> {
  return new Promise((resolve) => {
    queue = [...queue, { options, resolve }];
    emit();
  });
}

/** Cancels every pending request. For tests, so an unanswered question never leaks between them. */
export function resetConfirmDialogs() {
  const pending = queue;
  queue = [];
  emit();
  for (const request of pending) request.resolve({ confirmed: false });
}

function settle(confirmed: boolean) {
  const [current, ...rest] = queue;
  if (!current) return;
  queue = rest;
  emit();
  current.resolve({ confirmed });
}

/** Renders the confirm requests made through confirmDialog. Mount once, inside the app shell. */
export function ConfirmDialogHost() {
  const current = useSyncExternalStore(subscribe, getCurrent, getCurrent);
  const options = current?.options;

  return (
    <AlertDialog
      open={Boolean(current)}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      {options ? (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.message}</AlertDialogTitle>
            {options.detail ? <AlertDialogDescription>{options.detail}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{options.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              variant={options.destructive ? 'destructive-solid' : 'primary'}
              onClick={() => settle(true)}
            >
              {options.confirmLabel ?? 'OK'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
