import { createContext, useContext, useSyncExternalStore, type ButtonHTMLAttributes } from 'react';

import type { TreeFocusItem } from './folder-tree-focus';

export type FolderTreeFocusState = {
  focusedId: string | null;
  selectedId: string | null;
  items: Map<string, TreeFocusItem>;
};

/**
 * The tree's roving focus as a store rather than a context value: rows subscribe to their own
 * slice (tab stop, selection, depth), so a change elsewhere in the tree, such as a folder opening,
 * does not re-render every row.
 */
export type FolderTreeFocusStore = {
  getState: () => FolderTreeFocusState;
  /** Called during the tree's render, so rows rendering in the same pass read the new state. */
  setState: (state: FolderTreeFocusState) => void;
  /** Called after commit, so rows that did not re-render re-check their slice. */
  notify: () => void;
  subscribe: (listener: () => void) => () => void;
};

export function createFolderTreeFocusStore(initial: FolderTreeFocusState): FolderTreeFocusStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (next) => { state = next; },
    notify: () => listeners.forEach((listener) => listener()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const FolderTreeFocusContext = createContext<{
  treeId: string;
  store: FolderTreeFocusStore;
  onFocus: (id: string) => void;
} | null>(null);

export function useFolderTreeGroupId(folderId: string) {
  const context = useContext(FolderTreeFocusContext);
  return context ? `${context.treeId}-children-${encodeURIComponent(folderId)}` : undefined;
}

export function useFolderTreeControlId(id: string, control: 'drag' | 'toggle') {
  const context = useContext(FolderTreeFocusContext);
  return context ? `${context.treeId}-${encodeURIComponent(id)}-${control}` : undefined;
}

const NO_STORE: FolderTreeFocusStore = createFolderTreeFocusStore({ focusedId: null, selectedId: null, items: new Map() });

export function useFolderTreeItem(id: string, selected: boolean, expanded?: boolean, controls: Array<'drag' | 'toggle'> = []): ButtonHTMLAttributes<HTMLButtonElement> | undefined {
  const context = useContext(FolderTreeFocusContext);
  const store = context?.store ?? NO_STORE;
  // A string snapshot: the row re-renders only when one of these values changes.
  const slice = useSyncExternalStore(store.subscribe, () => {
    const state = store.getState();
    const item = state.items.get(id);
    if (!item) return '';
    return `${state.focusedId === id ? 1 : 0}|${state.selectedId === id ? 1 : 0}|${item.depth}|${item.hasChildren ? 1 : 0}|${item.kind}|${item.folderId ?? ''}`;
  });
  if (!context || !slice) return undefined;
  const [focused, isSelectedRow, depth, hasChildren, kind, folderId] = slice.split('|');

  // Own sibling controls without nesting native buttons. Only treeitems/groups
  // belong directly to a tree group in the accessibility tree.
  const ownedIds = controls.map(control => `${context.treeId}-${encodeURIComponent(id)}-${control}`);
  if (kind === 'folder' && expanded && hasChildren === '1') {
    ownedIds.push(`${context.treeId}-children-${encodeURIComponent(folderId ?? '')}`);
  }
  if (kind === 'root' && expanded) {
    ownedIds.push(`${context.treeId}-workspace-children`);
  }
  return {
    role: 'treeitem',
    tabIndex: focused === '1' ? 0 : -1,
    'aria-level': Number(depth) + 1,
    'aria-selected': selected && isSelectedRow === '1',
    'aria-expanded': (kind === 'folder' || kind === 'root') && hasChildren === '1' ? expanded : undefined,
    'aria-owns': ownedIds.length ? ownedIds.join(' ') : undefined,
    onFocus: () => context.onFocus(id),
  };
}
