import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

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
  treeId: string;
  selectedRowId: string | null;
  actions: FolderTreeKeyboardActions;
  collapsedFolderIds: Set<string>;
  tree: FolderTree;
  treeRef: RefObject<HTMLDivElement | null>;
};

export function useFolderTreeKeyboardNavigation({
  treeId,
  selectedRowId,
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
  const [focusedId, setFocusedId] = useState(selectedRowId);
  const itemsById = useMemo(() => new Map(focusItems.map(item => [item.id, item])), [focusItems]);
  const previousItemsRef = useRef(focusItems);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const effectiveFocusedId = focusedId && itemsById.has(focusedId)
    ? focusedId
    : selectedRowId && itemsById.has(selectedRowId) ? selectedRowId : focusItems[0]?.id ?? null;

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
    target?.scrollIntoView?.({ block: 'nearest' });
  }, [treeRef]);

  useLayoutEffect(() => {
    const previousItems = previousItemsRef.current;
    previousItemsRef.current = focusItems;
    if (!focusedId || itemsById.has(focusedId)) return;

    const oldIndex = previousItems.findIndex(item => item.id === focusedId);
    const previousItemsById = new Map(previousItems.map(item => [item.id, item]));
    let parentId: string | null | undefined = previousItems[oldIndex]?.parentFolderId;
    let nextId: string | undefined;
    while (parentId) {
      const parent = createFolderFocusId(parentId);
      if (itemsById.has(parent)) {
        nextId = parent;
        break;
      }
      parentId = previousItemsById.get(parent)?.parentFolderId;
    }
    nextId ??= focusItems[Math.max(0, Math.min(oldIndex, focusItems.length - 1))]?.id;
    setFocusedId(nextId ?? null);
    // Recover only a removed tree control's focus, never steal it from a dialog or editor.
    const lastElement = lastFocusedElementRef.current;
    if (nextId && lastElement && !lastElement.isConnected && document.activeElement === document.body) {
      focusTreeItem(nextId);
    }
  }, [focusItems, focusedId, focusTreeItem, itemsById]);

  const onFocus = useCallback((id: string) => {
    setFocusedId(id);
    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  const focusContext = useMemo(() => ({
    treeId, focusedId: effectiveFocusedId, selectedId: selectedRowId, items: itemsById, onFocus,
  }), [treeId, effectiveFocusedId, selectedRowId, itemsById, onFocus]);

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

  const handleTreeKeyDown = useCallback((event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => {
    const isComposing = 'nativeEvent' in event ? event.nativeEvent.isComposing : event.isComposing;
    if (event.defaultPrevented || isComposing || shouldIgnoreFolderTreeKeydown(event.target) || focusItems.length === 0) {
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

      const nextItem = focusItems.find(item => item.parentFolderId === currentItem.folderId);
      if (nextItem) {
        focusTreeItem(nextItem.id);
      }
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'ArrowLeft' && currentItem) {
      event.preventDefault();
      if (currentItem.kind === 'folder' && currentItem.folderId && currentItem.folderId !== UNFILED_FOLDER_ID && currentItem.hasChildren && !collapsedFolderIds.has(currentItem.folderId)) {
        actions.onFolderToggle(currentItem.folderId);
        return;
      }

      if (currentItem.parentFolderId) {
        focusTreeItem(createFolderFocusId(currentItem.parentFolderId));
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

  useEffect(() => {
    const treeElement = treeRef.current;
    if (!treeElement) {
      return undefined;
    }

    const handleNativeKeyDown = (event: KeyboardEvent) => {
      handleTreeKeyDown(event);
    };

    treeElement.addEventListener('keydown', handleNativeKeyDown);
    const handleFocusIn = (event: FocusEvent) => {
      const id = getKeyboardFocusRowId(event.target);
      if (id) onFocus(id);
    };
    treeElement.addEventListener('focusin', handleFocusIn);

    return () => {
      treeElement.removeEventListener('keydown', handleNativeKeyDown);
      treeElement.removeEventListener('focusin', handleFocusIn);
    };
  }, [handleTreeKeyDown, onFocus, treeRef]);

  return { focusContext };
}
