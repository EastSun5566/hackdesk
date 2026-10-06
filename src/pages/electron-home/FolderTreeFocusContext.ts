import { createContext, useContext, type ButtonHTMLAttributes } from 'react';

import type { TreeFocusItem } from './folder-tree-focus';

export const FolderTreeFocusContext = createContext<{
  treeId: string;
  focusedId: string | null;
  selectedId: string | null;
  items: Map<string, TreeFocusItem>;
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

export function useFolderTreeItem(id: string, selected: boolean, expanded?: boolean, controls: Array<'drag' | 'toggle'> = []): ButtonHTMLAttributes<HTMLButtonElement> | undefined {
  const context = useContext(FolderTreeFocusContext);
  const item = context?.items.get(id);
  if (!context || !item) return undefined;

  // Own sibling controls without nesting native buttons. Only treeitems/groups
  // belong directly to a tree group in the accessibility tree.
  const ownedIds = controls.map(control => `${context.treeId}-${encodeURIComponent(id)}-${control}`);
  if (item.kind === 'folder' && expanded && item.hasChildren) {
    ownedIds.push(`${context.treeId}-children-${encodeURIComponent(item.folderId ?? '')}`);
  }
  return {
    role: 'treeitem',
    tabIndex: context.focusedId === id ? 0 : -1,
    'aria-level': item.depth + 1,
    'aria-selected': selected && context.selectedId === id,
    'aria-expanded': item.hasChildren ? expanded : undefined,
    'aria-owns': ownedIds.length ? ownedIds.join(' ') : undefined,
    onFocus: () => context.onFocus(id),
  };
}
