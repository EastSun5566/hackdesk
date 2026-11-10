import { useSyncExternalStore } from 'react';
import { trySetStorageItem } from '@/lib/storage';

const KEY = 'hackdesk_show_hidden_files';
const listeners = new Set<() => void>();
const read = () => typeof window !== 'undefined' && window.localStorage.getItem(KEY) === 'true';
export function setShowHiddenFiles(value: boolean) {
  trySetStorageItem(window.localStorage, KEY, String(value));
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) listener(); };
  window.addEventListener('storage', storage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', storage); };
}
export function useShowHiddenFiles() { return useSyncExternalStore(subscribe, read, () => false); }
export function isHiddenLocalPath(path: string) { return path.split(/[\\/]/).some((part) => part.startsWith('.')); }
