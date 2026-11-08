import { useSyncExternalStore } from 'react';

import { readBooleanStorage, writeBooleanStorage } from './ui-preferences';

/** Whether the sidebar tree draws its indent guide lines. On by default; kept on this computer. */
export const TREE_GUIDES_KEY = 'hackdesk_tree_indent_guides';

const listeners = new Set<() => void>();

export function readTreeGuides() {
  return readBooleanStorage(TREE_GUIDES_KEY, true);
}

/**
 * Guides are hidden with one CSS rule keyed on the root element (see styles.css), so turning
 * them off never re-renders the tree.
 */
export function applyTreeGuides(show = readTreeGuides()) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.treeGuides = show ? 'shown' : 'hidden';
}

export function setTreeGuides(show: boolean) {
  writeBooleanStorage(TREE_GUIDES_KEY, show);
  applyTreeGuides(show);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTreeGuides() {
  return useSyncExternalStore(subscribe, readTreeGuides, () => true);
}
