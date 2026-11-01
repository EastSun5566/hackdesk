import type { FolderPathSummary } from '@/lib/electron-api';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { buttonVariants } from '@/components/ui/button';

export const FOCUS_RING_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
/** For rows and controls inside a scrolling or clipped container, where an outer ring would be cut off. */
export const FOCUS_RING_INSET_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';
/** Chrome that Hack Mode hides, leaving only the note; see the app's data-hack-mode. */
export const HACK_MODE_HIDDEN_CLASS = '[[data-hack-mode]_&]:hidden';
/** The top bar stays as a blank strip in Hack Mode, so the window can still be dragged. */
export const HACK_MODE_DRAG_STRIP_CLASS = '[[data-hack-mode]_&]:bg-background-default [[data-hack-mode]_&>*]:invisible';
/**
 * Motion: floating popups take 150ms, easing out on the way in and in on the way out, and grow from
 * their trigger. Panels take 200ms easing out. Reduced motion turns every one of them off.
 */
export const PANEL_MOTION_CLASS = 'transition-all duration-200 ease-out motion-reduce:transition-none [html[data-panel-resizing]_&]:transition-none';
/**
 * Surfaces: the top bar, sidebar and key hints sit on the app background, and notes sit on cards set
 * a gap apart. A card keeps a faint outline because some themes barely tell the two surfaces apart.
 * Hack Mode is edge to edge. Lines only mark content scrolling under a header; see .scroll-edges.
 */
export const CARD_SURFACE_CLASS = 'overflow-clip rounded-lg border border-border-default/60 bg-background-default [[data-hack-mode]_&]:rounded-none [[data-hack-mode]_&]:border-transparent';
/** A resize handle in the gap between surfaces: invisible until pointed at or focused. */
export const GAP_SASH_CLASS = 'relative w-1.5 shrink-0 cursor-col-resize border-0 bg-transparent outline-none after:absolute after:inset-y-3 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors hover:after:bg-primary-default focus-visible:after:bg-primary-default motion-reduce:after:transition-none';
export const COLLAPSE_ICON_CLASS = 'transition-transform duration-150 ease-out motion-reduce:transition-none';
export const ICON_BUTTON_CLASS = buttonVariants({ variant: 'ghost', size: 'icon' });
const noteDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const compactNoteDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

export function formatDate(millis: number | null) {
  if (!millis) {
    return 'No date';
  }

  return noteDateFormatter.format(new Date(millis));
}

export function formatCompactDate(millis: number | null) {
  return millis ? compactNoteDateFormatter.format(new Date(millis)) : 'No date';
}

export function createQuickNoteContent(title: string) {
  return `# ${title}\n\n`;
}

export function getFolderPathLabel(path: FolderPathSummary[]) {
  return path.length > 0 ? path.map((folder) => folder.name).join(' / ') : '';
}

export function getFolderNoteEntries(tree: FolderTree, selectedFolderId: string | null): FolderTreeNote[] {
  if (!selectedFolderId) {
    return tree.allNotes;
  }

  if (selectedFolderId === UNFILED_FOLDER_ID) {
    return tree.unfiled.notes;
  }

  return tree.nodesById.get(selectedFolderId)?.notes ?? [];
}

export function getFolderTotalNoteCount(node: FolderTreeNode): number {
  return node.notes.length + node.children.reduce((total, child) => total + getFolderTotalNoteCount(child), 0);
}
