import { useSyncExternalStore } from 'react';

import { readBooleanStorage, writeBooleanStorage } from './ui-preferences';

/** Experimental split status line: fixed halves instead of swapping hints on focus. */
export const SPLIT_STATUS_LINE_KEY = 'hackdesk_split_status_line';

const listeners = new Set<() => void>();

export function readSplitStatusLine() {
  return readBooleanStorage(SPLIT_STATUS_LINE_KEY, false);
}

export function setSplitStatusLine(enabled: boolean) {
  writeBooleanStorage(SPLIT_STATUS_LINE_KEY, enabled);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSplitStatusLine() {
  return useSyncExternalStore(subscribe, readSplitStatusLine, () => false);
}
