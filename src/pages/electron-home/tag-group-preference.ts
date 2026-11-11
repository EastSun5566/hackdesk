import { useSyncExternalStore } from 'react';

import { trySetStorageItem } from '@/lib/storage';
import { DEFAULT_TAG_GROUP_ORDER, normalizeTagGroupOrder, type TagGroupOrder } from '@/lib/electron-tag-groups';

const ENABLED_KEY = 'hackdesk_tag_grouping';
const ORDER_KEY = 'hackdesk_tag_grouping_order';
const COLLAPSED_KEY = 'hackdesk_tag_grouping_collapsed';

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === ENABLED_KEY || event.key === ORDER_KEY || event.key === COLLAPSED_KEY) listener();
  };
  window.addEventListener('storage', storage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', storage);
  };
}
function notify() {
  listeners.forEach((listener) => listener());
}

/**
 * Whether the sidebar groups its root (folder-less) notes under each note's first tag.
 * On by default: only an explicit "false" turns it off.
 */
function readTagGroupingEnabled() {
  return typeof window === 'undefined' || window.localStorage.getItem(ENABLED_KEY) !== 'false';
}
export function setTagGroupingEnabled(value: boolean) {
  trySetStorageItem(window.localStorage, ENABLED_KEY, String(value));
  notify();
}
export function useTagGroupingEnabled() {
  return useSyncExternalStore(subscribe, readTagGroupingEnabled, () => true);
}

/** Tag groups order themselves by name or by their newest note. */
function readTagGroupOrder(): TagGroupOrder {
  return normalizeTagGroupOrder(typeof window !== 'undefined' ? window.localStorage.getItem(ORDER_KEY) : null);
}
export function setTagGroupOrder(value: TagGroupOrder) {
  trySetStorageItem(window.localStorage, ORDER_KEY, value);
  notify();
}
export function useTagGroupOrder() {
  return useSyncExternalStore(subscribe, readTagGroupOrder, () => DEFAULT_TAG_GROUP_ORDER);
}

/** Collapsed tag groups, stored as an array of tag names. Absent names start expanded. */
const EMPTY_COLLAPSED_TAG_GROUPS = new Set<string>();
let collapsedCache: { raw: string | null; value: Set<string> } | null = null;
function readCollapsedTagGroups(): Set<string> {
  if (typeof window === 'undefined') {
    return EMPTY_COLLAPSED_TAG_GROUPS;
  }
  const raw = window.localStorage.getItem(COLLAPSED_KEY);
  if (collapsedCache?.raw === raw) {
    return collapsedCache.value;
  }
  if (!raw) {
    collapsedCache = { raw, value: EMPTY_COLLAPSED_TAG_GROUPS };
    return EMPTY_COLLAPSED_TAG_GROUPS;
  }
  let value = EMPTY_COLLAPSED_TAG_GROUPS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) value = new Set(parsed.filter((candidate): candidate is string => typeof candidate === 'string'));
  } catch {
    // Keep the default: an unreadable store means no collapsed groups.
  }
  collapsedCache = { raw, value };
  return value;
}
function writeCollapsedTagGroups(values: Iterable<string>) {
  trySetStorageItem(window.localStorage, COLLAPSED_KEY, JSON.stringify([...values]));
  notify();
}
export function useCollapsedTagGroups() {
  return useSyncExternalStore(subscribe, readCollapsedTagGroups, () => EMPTY_COLLAPSED_TAG_GROUPS);
}
/** Groups start expanded, so collapsing a group stores the exception, not all its siblings. */
export function toggleCollapsedTagGroup(tag: string) {
  const values = new Set(readCollapsedTagGroups());
  if (values.has(tag)) values.delete(tag);
  else values.add(tag);
  writeCollapsedTagGroups(values);
}
