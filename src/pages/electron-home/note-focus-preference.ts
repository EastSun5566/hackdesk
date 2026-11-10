import { useSyncExternalStore } from 'react';
import { trySetStorageItem } from '@/lib/storage';

const KEY = 'hackdesk_focus_editor_on_open';
const listeners = new Set<() => void>();

export function readFocusEditorOnOpen(): boolean {
  return typeof window === 'undefined' || window.localStorage.getItem(KEY) !== 'false';
}

export function setFocusEditorOnOpen(value: boolean) {
  if (typeof window !== 'undefined') trySetStorageItem(window.localStorage, KEY, String(value));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

export function useFocusEditorOnOpen() {
  return useSyncExternalStore(subscribe, readFocusEditorOnOpen, () => true);
}
