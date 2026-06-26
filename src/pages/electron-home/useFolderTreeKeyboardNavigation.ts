import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from 'react';

import type { NoteSummary } from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import {
  createFolderFocusId,
  findTypeaheadMatch,
  getFolderTreeFocusItems,
  getKeyboardFocusRowId,
  normalizeCreateNoteFolderId,
  shouldIgnoreFolderTreeKeydown,
} from './folder-tree-focus';

export type FolderTreeKeyboardActions = {
  onCreateNoteInside: (folderId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onFolderSelect: (folderId: string | null) => void;
  onFolderToggle: (folderId: string) => void;
  onNoteSelect: (note: NoteSummary) => void;
  onOpenNote: (note: NoteSummary) => void;
  onRenameFolder: (folderId: string) => void;
};

export type UseFolderTreeKeyboardNavigationOptions = {
  actions: FolderTreeKeyboardActions;
  collapsedFolderIds: Set<string>;
  tree: FolderTree;
  treeRef: RefObject<HTMLDivElement | null>;
};

export function useFolderTreeKeyboardNavigation({
  actions,
  collapsedFolderIds,
  tree,
  treeRef,
}: UseFolderTreeKeyboardNavigationOptions) {
  const typeaheadBufferRef = useRef('');
  const typeaheadResetTimerRef = useRef<number | null>(null);
  const focusItems = useMemo(
    () => getFolderTreeFocusItems(tree, collapsedFolderIds),
    [collapsedFolderIds, tree],
  );

  useEffect(() => () => {
    if (typeaheadResetTimerRef.current !== null) {
      window.clearTimeout(typeaheadResetTimerRef.current);
    }
  }, []);

  const focusTreeItem = useCallback((itemId: string) => {
    const row = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[data-folder-tree-row-id]') ?? [])
      .find((candidate) => candidate.dataset.folderTreeRowId === itemId);
    const target = row?.querySelector<HTMLElement>('[data-folder-tree-primary="true"]')
      ?? row?.querySelector<HTMLElement>('button:not([disabled])');

    target?.focus();
  }, [treeRef]);

  const focusItemAtIndex = useCallback((index: number) => {
    const item = focusItems[Math.max(0, Math.min(index, focusItems.length - 1))];
    if (item) {
      focusTreeItem(item.id);
    }
  }, [focusItems, focusTreeItem]);

  const resetTypeaheadTimer = useCallback(() => {
    if (typeaheadResetTimerRef.current !== null) {
      window.clearTimeout(typeaheadResetTimerRef.current);
    }

    typeaheadResetTimerRef.current = window.setTimeout(() => {
      typeaheadBufferRef.current = '';
      typeaheadResetTimerRef.current = null;
    }, 700);
  }, []);

  const runTypeahead = useCallback((key: string, currentIndex: number) => {
    const nextBuffer = `${typeaheadBufferRef.current}${key}`.toLocaleLowerCase();
    const singleKeyBuffer = key.toLocaleLowerCase();
    const match = findTypeaheadMatch(focusItems, nextBuffer, currentIndex)
      ?? (nextBuffer === singleKeyBuffer ? null : findTypeaheadMatch(focusItems, singleKeyBuffer, currentIndex));

    if (!match) {
      typeaheadBufferRef.current = singleKeyBuffer;
      resetTypeaheadTimer();
      return;
    }

    typeaheadBufferRef.current = match.label.toLocaleLowerCase().startsWith(nextBuffer)
      ? nextBuffer
      : singleKeyBuffer;
    resetTypeaheadTimer();
    focusTreeItem(match.id);
  }, [focusItems, focusTreeItem, resetTypeaheadTimer]);

  const handleTreeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (shouldIgnoreFolderTreeKeydown(event.target) || focusItems.length === 0) {
      return;
    }

    const isPlainKey = !event.metaKey && !event.altKey && !event.shiftKey;
    const isPrimaryModifier = event.metaKey || event.ctrlKey;
    const isCtrlNext = event.ctrlKey && isPlainKey && event.key.toLowerCase() === 'n';
    const isCtrlPrevious = event.ctrlKey && isPlainKey && event.key.toLowerCase() === 'p';
    const currentRowId = getKeyboardFocusRowId(event.target);
    const currentIndex = currentRowId ? focusItems.findIndex((item) => item.id === currentRowId) : -1;
    const currentItem = currentIndex >= 0 ? focusItems[currentIndex] : null;

    if (isPrimaryModifier && event.shiftKey && event.key.toLowerCase() === 'n' && currentItem) {
      event.preventDefault();
      if (currentItem.kind === 'folder') {
        actions.onCreateNoteInside(normalizeCreateNoteFolderId(currentItem.folderId ?? null));
        return;
      }

      if (currentItem.kind === 'note') {
        actions.onCreateNoteInside(normalizeCreateNoteFolderId(currentItem.parentFolderId));
      }
      return;
    }

    if (isPrimaryModifier && event.key === 'Enter' && currentItem?.kind === 'note' && currentItem.note) {
      event.preventDefault();
      actions.onOpenNote(currentItem.note.note);
      return;
    }

    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === 'F2' && currentItem?.kind === 'folder') {
      event.preventDefault();
      if (currentItem.folderId && currentItem.folderId !== UNFILED_FOLDER_ID) {
        actions.onRenameFolder(currentItem.folderId);
      }
      return;
    }

    if (isPrimaryModifier && event.key === 'Backspace' && currentItem) {
      event.preventDefault();
      if (currentItem.kind === 'folder' && currentItem.folderId && currentItem.folderId !== UNFILED_FOLDER_ID) {
        actions.onDeleteFolder(currentItem.folderId);
        return;
      }

      if (currentItem.kind === 'note' && currentItem.note) {
        actions.onDeleteNote(currentItem.note.note);
      }
      return;
    }

    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      return;
    }

    if (
      !event.ctrlKey
      && !event.metaKey
      && !event.altKey
      && event.key.length === 1
      && /^[\p{L}\p{N}]$/u.test(event.key)
      && currentItem
    ) {
      event.preventDefault();
      runTypeahead(event.key, currentIndex);
      return;
    }

    if ((!event.ctrlKey && isPlainKey && event.key === 'ArrowDown') || isCtrlNext) {
      event.preventDefault();
      focusItemAtIndex(currentIndex >= 0 ? currentIndex + 1 : 0);
      return;
    }

    if ((!event.ctrlKey && isPlainKey && event.key === 'ArrowUp') || isCtrlPrevious) {
      event.preventDefault();
      focusItemAtIndex(currentIndex >= 0 ? currentIndex - 1 : focusItems.length - 1);
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'Home') {
      event.preventDefault();
      focusItemAtIndex(0);
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'End') {
      event.preventDefault();
      focusItemAtIndex(focusItems.length - 1);
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'ArrowRight' && currentItem?.kind === 'folder') {
      event.preventDefault();
      if (currentItem.folderId && currentItem.folderId !== UNFILED_FOLDER_ID && currentItem.hasChildren && collapsedFolderIds.has(currentItem.folderId)) {
        actions.onFolderToggle(currentItem.folderId);
        return;
      }

      const nextItem = focusItems[currentIndex + 1];
      if (nextItem && nextItem.depth > currentItem.depth) {
        focusTreeItem(nextItem.id);
      }
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'ArrowLeft' && currentItem?.kind === 'folder') {
      event.preventDefault();
      if (currentItem.folderId && currentItem.folderId !== UNFILED_FOLDER_ID && currentItem.hasChildren && !collapsedFolderIds.has(currentItem.folderId)) {
        actions.onFolderToggle(currentItem.folderId);
        return;
      }

      if (currentItem.folderId !== UNFILED_FOLDER_ID) {
        focusTreeItem(createFolderFocusId(currentItem.parentFolderId ?? UNFILED_FOLDER_ID));
      }
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'Enter' && currentItem) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const primaryAction = target?.dataset.folderTreePrimary === 'true'
        || currentItem.id === createFolderFocusId(UNFILED_FOLDER_ID);

      if (!primaryAction) {
        return;
      }

      event.preventDefault();
      if (currentItem.kind === 'folder' && currentItem.folderId) {
        actions.onFolderSelect(currentItem.folderId);
        return;
      }

      if (currentItem.kind === 'note' && currentItem.note) {
        actions.onNoteSelect(currentItem.note.note);
      }
    }
  }, [
    actions,
    collapsedFolderIds,
    focusItemAtIndex,
    focusItems,
    focusTreeItem,
    runTypeahead,
  ]);

  return { handleTreeKeyDown };
}
