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
export const HACK_MODE_DRAG_STRIP_CLASS = '[[data-hack-mode]_&]:border-transparent [[data-hack-mode]_&>*]:invisible';
/**
 * Motion: floating popups take 150ms, easing out on the way in and in on the way out, and grow from
 * their trigger. Panels take 200ms easing out. Reduced motion turns every one of them off.
 */
export const PANEL_MOTION_CLASS = 'transition-all duration-200 ease-out motion-reduce:transition-none [html[data-panel-resizing]_&]:transition-none';
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
