import { useSyncExternalStore } from 'react';

import { readBooleanStorage, writeBooleanStorage } from './ui-preferences';

/** Whether the line under the editor shows at all. On by default; kept on this computer. */
export const STATUS_LINE_KEY = 'hackdesk_status_line_visible';

const listeners = new Set<() => void>();

export function readStatusLineVisible() {
  return readBooleanStorage(STATUS_LINE_KEY, true);
}

export function setStatusLineVisible(visible: boolean) {
  writeBooleanStorage(STATUS_LINE_KEY, visible);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStatusLineVisible() {
  return useSyncExternalStore(subscribe, readStatusLineVisible, () => true);
}
