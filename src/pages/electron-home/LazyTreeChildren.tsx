import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import type { FolderTreeNode } from '@/lib/hackmd-folders';

/**
 * How far past the sidebar's visible edge an open folder's rows are built ahead of time, so a
 * scroll finds them already there.
 */
const MOUNT_MARGIN_PX = 800;
/** A row and the gap after it, for the space a not yet built folder holds open. */
export const TREE_ROW_PITCH_PX = 34;

/**
 * The open folders whose rows are not built yet, and a way to build them on demand: the keyboard,
 * and revealing the open note, need rows the user has not scrolled to.
 */
export type PendingTreeChildren = {
  register: (id: string, mount: () => void) => () => void;
  /** Builds these folders' rows (outermost first) in the next render, nested ones included. */
  reveal: (ids: string[]) => boolean;
  isForced: (id: string) => boolean;
};

export function createPendingTreeChildren(): PendingTreeChildren {
  const mounts = new Map<string, () => void>();
  const forced = new Set<string>();
  return {
    register: (id, mount) => {
      mounts.set(id, mount);
      return () => {
        if (mounts.get(id) === mount) mounts.delete(id);
      };
    },
    reveal: (ids) => {
      let changed = false;
      for (const id of ids) {
        if (!forced.has(id)) {
          forced.add(id);
          changed = true;
        }
        const mount = mounts.get(id);
        if (mount) {
          mount();
          changed = true;
        }
      }
      return changed;
    },
    isForced: (id) => forced.has(id),
  };
}

export const PendingTreeChildrenContext = createContext<PendingTreeChildren | null>(null);

/** How many rows an open folder shows: its folders, their open contents, and its notes. */
export function countVisibleTreeRows(node: FolderTreeNode, collapsedFolderIds: Set<string>): number {
  let rows = node.notes.length;
  for (const child of node.children) {
    rows += 1;
    if (!collapsedFolderIds.has(child.id)) rows += countVisibleTreeRows(child, collapsedFolderIds);
  }
  return rows;
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
  for (let current = element.parentElement; current; current = current.parentElement) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') return current;
  }
  return null;
}

/** Whether the placeholder sits within the mount margin of what the sidebar shows. */
function isNearView(element: HTMLElement, scrollParent: HTMLElement | null) {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) {
    // Hidden (a closed root section), or no layout at all (jsdom): build the rows only in the
    // latter, where there is no view to wait for.
    return document.documentElement.getBoundingClientRect().height === 0;
  }
  const view = scrollParent?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
  return rect.bottom >= view.top - MOUNT_MARGIN_PX && rect.top <= view.bottom + MOUNT_MARGIN_PX;
}

/**
 * An open folder's contents. They are built the first time they open near the visible part of the
 * sidebar, then stay built (hidden) when the folder closes: reopening is a style change, not a
 * rebuild. Until then a blank block of their height holds their place, and they are built as it
 * scrolls near. "Expand all folders" in a large workspace used to build every row of the tree in
 * one frame; now it builds what the sidebar shows.
 */
export function LazyTreeChildren({ id, open, rowCount, children }: {
  /** The parent's focus id as the focus items name it (a folder id, or a tag group's id). */
  id: string;
  open: boolean;
  /** How many rows the contents show, for the placeholder's height; read only while pending. */
  rowCount: () => number;
  children: ReactNode;
}) {
  const pending = useContext(PendingTreeChildrenContext);
  const [built, setBuilt] = useState(false);
  if (open && !built && pending?.isForced(id)) setBuilt(true);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const waiting = open && !built;

  useLayoutEffect(() => {
    const placeholder = placeholderRef.current;
    if (!waiting || !placeholder) return undefined;
    const scrollParent = findScrollParent(placeholder);
    // Before paint, so a folder opened in view shows its rows in the same frame.
    if (isNearView(placeholder, scrollParent) || typeof IntersectionObserver === 'undefined') {
      setBuilt(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setBuilt(true);
    }, { root: scrollParent, rootMargin: `${MOUNT_MARGIN_PX}px 0px` });
    observer.observe(placeholder);
    return () => observer.disconnect();
  }, [waiting]);

  useEffect(() => {
    if (!waiting || !pending) return undefined;
    return pending.register(id, () => setBuilt(true));
  }, [id, pending, waiting]);

  if (built) return <div hidden={!open} className="contents">{children}</div>;
  if (!open) return null;
  return (
    <div
      ref={placeholderRef}
      aria-hidden="true"
      data-tree-pending-children={id}
      className="h-(--tree-pending-height)"
      style={{ '--tree-pending-height': `${rowCount() * TREE_ROW_PITCH_PX}px` } as CSSProperties}
    />
  );
}
