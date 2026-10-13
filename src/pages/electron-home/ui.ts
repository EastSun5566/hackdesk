import type { FolderPathSummary } from '@/lib/electron-api';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { buttonVariants } from '@/components/ui/button';

export const FOCUS_RING_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
export const PANEL_TRANSITION_CLASS = 'transition-colors duration-150 ease-out motion-reduce:transition-none';
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
