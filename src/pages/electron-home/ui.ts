import type { FolderPathSummary } from '@/lib/electron-api';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

export const FOCUS_RING_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default';
export const PRESSED_CLASS = 'active:translate-y-px';
export const PANEL_TRANSITION_CLASS = 'transition-[width,border-color,background-color] duration-200 ease-out motion-reduce:transition-none';
export const COLLAPSE_ICON_CLASS = 'transition-transform duration-150 ease-out motion-reduce:transition-none';
export const ICON_BUTTON_CLASS = `inline-flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-background-selected hover:text-text-default motion-reduce:transition-none ${PRESSED_CLASS} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`;
export const SECONDARY_BUTTON_CLASS = `inline-flex h-9 items-center gap-2 rounded-md border border-border-default px-3 text-sm transition-colors active:bg-background-selected ${PRESSED_CLASS} ${FOCUS_RING_CLASS}`;
export const PRIMARY_BUTTON_CLASS = `inline-flex h-9 items-center gap-2 rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover ${PRESSED_CLASS} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`;
export const TEXT_INPUT_CLASS = 'h-10 w-full rounded-md border border-border-default bg-background-muted px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary-default focus-visible:ring-2 focus-visible:ring-primary-default/70';

export function formatDate(millis: number | null) {
  if (!millis) {
    return 'No date';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(millis));
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
