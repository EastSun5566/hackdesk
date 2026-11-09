import { useSyncExternalStore } from 'react';

import { trySetStorageItem } from '@/lib/storage';

/** What ⌘T and the tab-strip + control open when a note tab is already active. */
export const NEW_TAB_OPENS_KEY = 'hackdesk_new_tab_opens';

export type NewTabOpens = 'empty' | 'duplicate';

const listeners = new Set<() => void>();

export function readNewTabOpens(): NewTabOpens {
  if (typeof window === 'undefined') {
    return 'empty';
  }

  return window.localStorage.getItem(NEW_TAB_OPENS_KEY) === 'duplicate' ? 'duplicate' : 'empty';
}

export function setNewTabOpens(value: NewTabOpens) {
  if (typeof window !== 'undefined') {
    trySetStorageItem(window.localStorage, NEW_TAB_OPENS_KEY, value);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNewTabOpens() {
  return useSyncExternalStore(subscribe, readNewTabOpens, () => 'empty' as const);
}
