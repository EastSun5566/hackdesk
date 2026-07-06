import type { FolderPathSummary } from '@/lib/electron-api';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { cn } from '@/lib/utils';

export const FOCUS_RING_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
export const PRESSED_CLASS = 'active:translate-y-px';
export const PANEL_TRANSITION_CLASS = 'transition-[border-color,background-color] duration-150 ease-out motion-reduce:transition-none';
export const COLLAPSE_ICON_CLASS = 'transition-transform duration-150 ease-out motion-reduce:transition-none';
export const ICON_BUTTON_CLASS = cn(
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-element-bg-hover hover:text-text-default motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50',
  PRESSED_CLASS,
  FOCUS_RING_CLASS,
);
export const SECONDARY_BUTTON_CLASS = cn(
  'inline-flex h-9 items-center gap-2 rounded-md border border-border-default px-3 text-sm transition-colors hover:bg-element-bg-hover active:bg-background-selected',
  PRESSED_CLASS,
  FOCUS_RING_CLASS,
);
export const PRIMARY_BUTTON_CLASS = cn(
  'inline-flex h-9 items-center gap-2 rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50',
  PRESSED_CLASS,
  FOCUS_RING_CLASS,
);
export const TEXT_INPUT_CLASS = 'h-10 w-full rounded-md border border-border-default bg-background-muted px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/70';
const noteDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(millis: number | null) {
  if (!millis) {
    return 'No date';
  }

  return noteDateFormatter.format(new Date(millis));
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
