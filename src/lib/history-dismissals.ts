import { useSyncExternalStore } from 'react';

import { trySetStorageItem } from './storage';

/**
 * Notes removed from the History list. HackMD's public API can list history but not remove from
 * it, so removal is kept here, per HackMD account, and hides the note from History in this app
 * only. The note itself is untouched; opening it again ends the removal.
 */
const HISTORY_DISMISSALS_PREFIX = 'hackdesk_history_dismissed:';
const EMPTY = new Set<string>();
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; ids: ReadonlySet<string> }>();

function storageKey(accountId: string | null | undefined) {
  return `${HISTORY_DISMISSALS_PREFIX}${accountId ?? ''}`;
}

function getStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readHistoryDismissals(accountId: string | null | undefined): ReadonlySet<string> {
  const storage = getStorage();
  if (!storage) return EMPTY;
  const key = storageKey(accountId);
  let raw: string | null;
  try { raw = storage.getItem(key); } catch { return EMPTY; }
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.ids;
  let ids: ReadonlySet<string> = EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    if (Array.isArray(parsed)) ids = new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    // A damaged list hides nothing.
  }
  cache.set(key, { raw, ids });
  return ids;
}

function writeHistoryDismissals(accountId: string | null | undefined, ids: ReadonlySet<string>) {
  const storage = getStorage();
  if (!storage) return;
  trySetStorageItem(storage, storageKey(accountId), JSON.stringify([...ids]));
  listeners.forEach((listener) => listener());
}

export function removeFromHistory(accountId: string | null | undefined, noteId: string) {
  const current = readHistoryDismissals(accountId);
  if (current.has(noteId)) return;
  writeHistoryDismissals(accountId, new Set([...current, noteId]));
}

export function restoreToHistory(accountId: string | null | undefined, noteId: string) {
  const current = readHistoryDismissals(accountId);
  if (!current.has(noteId)) return;
  const next = new Set(current);
  next.delete(noteId);
  writeHistoryDismissals(accountId, next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useHistoryDismissals(accountId: string | null | undefined) {
  return useSyncExternalStore(subscribe, () => readHistoryDismissals(accountId), () => EMPTY);
}

export function withoutDismissedHistory<T extends { id: string }>(notes: T[], dismissed: ReadonlySet<string>) {
  return dismissed.size ? notes.filter((note) => !dismissed.has(note.id)) : notes;
}
