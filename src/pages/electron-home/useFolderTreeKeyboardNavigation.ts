import { ActionShortcutContext } from './ActionShortcutContext';
import { matchesCharacterShortcut } from './workbench-keyboard-context';
import { useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

import type { NoteSummary } from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import type { TagGroup as FolderTreeTagGroup } from '@/lib/electron-tag-groups';

import { createFolderTreeFocusStore } from './FolderTreeFocusContext';

import {
  buildFolderNavigatorFocusItems,
  createFolderFocusId,
  findTypeaheadMatch,
  getKeyboardFocusRowId,
  normalizeCreateNoteFolderId,
  shouldIgnoreFolderTreeKeydown,
  WORKSPACE_ROOT_FOCUS_ID,
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

/** What the tree's keyboard knows about first-tag grouping of its root notes. */
export type FolderTreeKeyboardTagGrouping = {
  collapsed: Set<string>;
  groups: FolderTreeTagGroup[];
  onToggle: (tag: string) => void;
} | null;

export type UseFolderTreeKeyboardNavigationOptions = {
  treeId: string;
  selectedRowId: string | null;
  actions: FolderTreeKeyboardActions;
  collapsedFolderIds: Set<string>;
  tree: FolderTree;
  treeRef: RefObject<HTMLDivElement | null>;
  showRoot: boolean;
  rootSectionExpanded: boolean;
  rootLabel: string;
  onRootSectionToggle?: () => void;
  /** Active when root notes group by first tag; absent keeps them flat. */
  tagGrouping?: FolderTreeKeyboardTagGrouping;
};

const NO_COLLAPSED_FOLDERS = new Set<string>();
const NO_COLLAPSED_TAG_GROUPS = new Set<string>();

export function useFolderTreeKeyboardNavigation({
  treeId,
  selectedRowId,
  actions,
  collapsedFolderIds,
  tree,
  treeRef,
  showRoot,
  rootSectionExpanded,
  rootLabel,
  onRootSectionToggle,
  tagGrouping = null,
}: UseFolderTreeKeyboardNavigationOptions) {
  const typeaheadBufferRef = useRef('');
  const typeaheadResetTimerRef = useRef<number | null>(null);
  // The caller's object is already stable across renders; keeping this derivation stable too lets
  // the focus-item memos below skip rebuilds while the sidebar resizes.
  const groupingOption = useMemo(
    () => tagGrouping ? { collapsed: tagGrouping.collapsed, groups: tagGrouping.groups } : null,
    [tagGrouping],
  );
  const focusItems = useMemo(
    () => buildFolderNavigatorFocusItems({
      tree,
      collapsedFolderIds,
      showRoot,
      rootSectionExpanded,
      rootLabel,
      grouping: groupingOption,
    }),
    [collapsedFolderIds, groupingOption, rootLabel, rootSectionExpanded, showRoot, tree],
  );
  const [focusedId, setFocusedId] = useState(selectedRowId);
  // The tree's tab stop follows the selection: opening a note elsewhere (a tab, the palette) makes
  // its row the place Tab and Cmd+Shift+E land, not wherever focus last was in the tree.
  const [previousSelectedRowId, setPreviousSelectedRowId] = useState(selectedRowId);
  if (previousSelectedRowId !== selectedRowId) {
    setPreviousSelectedRowId(selectedRowId);
    if (selectedRowId) setFocusedId(selectedRowId);
  }
  // What each row reads: every row of the tree, as if every folder and the root were open. Closing a
  // folder or the root hides its rows without unmounting them; built from the tree alone, no row's
  // entry changes on a toggle, so no row re-renders for one.
  const rowItems = useMemo(
    () => buildFolderNavigatorFocusItems({
      tree,
      collapsedFolderIds: NO_COLLAPSED_FOLDERS,
      showRoot,
      rootSectionExpanded: true,
      rootLabel,
      // Row data assumes every group open, like every folder open: collapsing hides rows.
      grouping: groupingOption ? { collapsed: NO_COLLAPSED_TAG_GROUPS, groups: groupingOption.groups } : null,
    }),
    [groupingOption, rootLabel, showRoot, tree],
  );
  const itemsById = useMemo(() => new Map(rowItems.map(item => [item.id, item])), [rowItems]);
  // What the keyboard can reach: rows under a collapsed root are skipped.
  const reachableIds = useMemo(() => new Set(focusItems.map(item => item.id)), [focusItems]);
  const previousItemsRef = useRef(focusItems);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const effectiveFocusedId = focusedId && reachableIds.has(focusedId)
    ? focusedId
    : selectedRowId && reachableIds.has(selectedRowId) ? selectedRowId : focusItems[0]?.id ?? null;

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
    if (!focusedId || reachableIds.has(focusedId)) return;

    const oldIndex = previousItems.findIndex(item => item.id === focusedId);
    const previousItemsById = new Map(previousItems.map(item => [item.id, item]));
    let parentId: string | null | undefined = previousItems[oldIndex]?.parentFolderId;
    let nextId: string | undefined;
    while (parentId) {
      const parent = createFolderFocusId(parentId);
      if (reachableIds.has(parent)) {
        nextId = parent;
        break;
      }
      parentId = previousItemsById.get(parent)?.parentFolderId;
    }
    nextId ??= focusItems[Math.max(0, Math.min(oldIndex, focusItems.length - 1))]?.id;
    setFocusedId(nextId ?? null);
    // Recover only a removed or hidden tree control's focus (a collapsed root keeps its rows mounted
    // but hidden), never steal it from a dialog or editor.
    const lastElement = lastFocusedElementRef.current;
    const lastGone = lastElement && (!lastElement.isConnected || Boolean(lastElement.closest('[hidden]')));
    if (nextId && lastGone && (document.activeElement === document.body || document.activeElement === lastElement)) {
      focusTreeItem(nextId);
    }
  }, [focusItems, focusedId, focusTreeItem, reachableIds]);

  const onFocus = useCallback((id: string) => {
    setFocusedId(id);
    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  // Rows read focus through a store (see FolderTreeFocusContext), so the context value stays the
  // same and only rows whose slice changed re-render.
  const [focusStore] = useState(() => createFolderTreeFocusStore({ focusedId: effectiveFocusedId, selectedId: selectedRowId, items: itemsById }));
  focusStore.setState({ focusedId: effectiveFocusedId, selectedId: selectedRowId, items: itemsById });
  useLayoutEffect(() => focusStore.notify());
  const focusContext = useMemo(() => ({ treeId, store: focusStore, onFocus }), [treeId, focusStore, onFocus]);

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

  const shortcutContext = useContext(ActionShortcutContext);
  const handleTreeKeyDown = useCallback((event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => {
    const isComposing = 'nativeEvent' in event ? event.nativeEvent.isComposing : event.isComposing;
    if (event.defaultPrevented || isComposing || shouldIgnoreFolderTreeKeydown(event.target) || focusItems.length === 0) {
      return;
    }

    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
    if (matchesCharacterShortcut(nativeEvent, shortcutContext.shortcuts, shortcutContext.platform, shortcutContext.characterShortcutsEnabled)) return;

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

    if (!event.ctrlKey && isPlainKey && event.key === 'ArrowRight' && currentItem?.kind === 'root') {
      event.preventDefault();
      if (!rootSectionExpanded) {
        onRootSectionToggle?.();
        return;
      }

      const nextItem = focusItems.find((item) => item.id !== WORKSPACE_ROOT_FOCUS_ID);
      if (nextItem) {
        focusTreeItem(nextItem.id);
      }
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'ArrowRight' && currentItem?.kind === 'tag-group') {
      event.preventDefault();
      if (tagGrouping && currentItem.groupTag !== undefined && currentItem.hasChildren && tagGrouping.collapsed.has(currentItem.groupTag)) {
        tagGrouping.onToggle(currentItem.groupTag);
        return;
      }

      const nextItem = focusItems.find((item) => item.parentFolderId === currentItem.id);
      if (nextItem) {
        focusTreeItem(nextItem.id);
      }
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

    if (!event.ctrlKey && isPlainKey && event.key === 'ArrowLeft' && currentItem?.kind === 'root') {
      event.preventDefault();
      if (rootSectionExpanded) {
        onRootSectionToggle?.();
      }
      return;
    }

    if (!event.ctrlKey && isPlainKey && event.key === 'ArrowLeft' && currentItem?.kind === 'tag-group') {
      event.preventDefault();
      if (tagGrouping && currentItem.groupTag !== undefined && !tagGrouping.collapsed.has(currentItem.groupTag)) {
        tagGrouping.onToggle(currentItem.groupTag);
        return;
      }

      if (showRoot && currentItem.depth === 1) {
        focusTreeItem(WORKSPACE_ROOT_FOCUS_ID);
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
        // Notes under a tag group mention the group by its focus id already; folder children mean
        // a folder id, which needs the focus-id prefix.
        focusTreeItem(currentItem.parentFolderId.startsWith('tag:') ? currentItem.parentFolderId : createFolderFocusId(currentItem.parentFolderId));
        return;
      }

      if (showRoot && currentItem.depth === 1) {
        focusTreeItem(WORKSPACE_ROOT_FOCUS_ID);
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
      if (currentItem.kind === 'root') {
        actions.onFolderSelect(UNFILED_FOLDER_ID);
        return;
      }

      if (currentItem.kind === 'folder' && currentItem.folderId) {
        actions.onFolderSelect(currentItem.folderId);
        return;
      }

      // A tag group can't be selected; Enter toggles it, like pressing the chevron.
      if (currentItem.kind === 'tag-group' && currentItem.groupTag !== undefined && tagGrouping) {
        tagGrouping.onToggle(currentItem.groupTag);
        return;
      }

      if (currentItem.kind === 'note' && currentItem.note) {
        actions.onNoteSelect(currentItem.note.note);
        return;
      }

    }
  }, [
    shortcutContext,
    actions,
    collapsedFolderIds,
    focusItemAtIndex,
    focusItems,
    focusTreeItem,
    onRootSectionToggle,
    rootSectionExpanded,
    runTypeahead,
    showRoot,
    tagGrouping,
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
