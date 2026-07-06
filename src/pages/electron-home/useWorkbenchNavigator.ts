import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
  applyNoteFinder,
  type NoteFinderState,
} from '@/lib/electron-note-finder';
import type { NoteDropOperation } from '@/lib/hackmd-note-dnd';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import type { WorkspaceScope } from './types';
import {
  getFolderNoteEntries,
  getFolderPathLabel,
} from './ui';

export type WorkbenchNavigatorOptions = {
  canUseHackmd: boolean;
  deferredFinderState: NoteFinderState;
  expandNavigator: () => void;
  finderActive: boolean;
  focusNavigator: () => void;
  moveNote: (operation: Pick<NoteDropOperation, 'note' | 'targetFolderId'>) => void;
  requestSelectNote: (note: FolderTreeNote['note'], options?: { focusEditor?: boolean; trackRecent?: boolean }) => Promise<boolean>;
  scopeType: WorkspaceScope['type'];
  selectedFolderId: string | null;
  setCollapsedFolderIds: Dispatch<SetStateAction<Set<string>>>;
  setFinderState: Dispatch<SetStateAction<NoteFinderState>>;
  setSelectedFolderId: Dispatch<SetStateAction<string | null>>;
  tree: FolderTree;
};

export function useWorkbenchNavigator({
  canUseHackmd,
  deferredFinderState,
  expandNavigator,
  finderActive,
  focusNavigator,
  moveNote,
  requestSelectNote,
  scopeType,
  selectedFolderId,
  setCollapsedFolderIds,
  setFinderState,
  setSelectedFolderId,
  tree,
}: WorkbenchNavigatorOptions) {
  const visibleEntries = useMemo(() => {
    const entries = finderActive
      ? applyNoteFinder(tree, deferredFinderState, selectedFolderId)
      : getFolderNoteEntries(tree, selectedFolderId);

    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = entry.note.id;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [deferredFinderState, finderActive, selectedFolderId, tree]);

  const selectedFolder = selectedFolderId === UNFILED_FOLDER_ID
    ? tree.unfiled
    : selectedFolderId ? tree.nodesById.get(selectedFolderId) ?? null : null;
  const selectedFolderLabel = selectedFolder ? getFolderPathLabel(selectedFolder.folderPath) : null;
  const selectedParentFolderId = selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID ? selectedFolderId : undefined;
  const canCreate = canUseHackmd && scopeType !== 'history';
  const canModifySelectedFolder = Boolean(selectedFolder?.id && selectedFolder.id !== UNFILED_FOLDER_ID);

  const revealFolderIds = useCallback((folderIds: string[]) => {
    if (folderIds.length === 0) {
      return;
    }

    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      folderIds.forEach((folderId) => next.delete(folderId));
      return next;
    });
  }, [setCollapsedFolderIds]);

  const toggleFolderCollapsed = useCallback((folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  }, [setCollapsedFolderIds]);

  const handleFolderSelect = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);

    if (folderId && folderId !== UNFILED_FOLDER_ID) {
      setCollapsedFolderIds((current) => {
        if (!current.has(folderId)) {
          return current;
        }

        const next = new Set(current);
        next.delete(folderId);
        return next;
      });
    }
  }, [setCollapsedFolderIds, setSelectedFolderId]);

  const revealNoteEntry = useCallback(async (entry: FolderTreeNote) => {
    const folderIds = entry.folderPath.map((folder) => folder.id);
    const leafFolderId = folderIds.at(-1) ?? UNFILED_FOLDER_ID;
    if (!await requestSelectNote(entry.note, {
      focusEditor: true,
      trackRecent: true,
    })) {
      return false;
    }

    expandNavigator();
    revealFolderIds(folderIds);
    setSelectedFolderId(leafFolderId);
    return true;
  }, [expandNavigator, requestSelectNote, revealFolderIds, setSelectedFolderId]);

  const handleShowFinderResults = useCallback((query: string) => {
    expandNavigator();
    setFinderState((current) => ({
      ...current,
      query,
      searchScope: 'workspace',
    }));
    focusNavigator();
  }, [expandNavigator, focusNavigator, setFinderState]);

  const handleNoteMove = useCallback((operation: NoteDropOperation) => {
    if (!operation.changed) {
      setSelectedFolderId(operation.targetFolderId ?? UNFILED_FOLDER_ID);
      void requestSelectNote(operation.note.note, { trackRecent: false });
      return;
    }

    moveNote({
      note: operation.note,
      targetFolderId: operation.targetFolderId,
    });
  }, [moveNote, requestSelectNote, setSelectedFolderId]);

  return {
    canCreate,
    canModifySelectedFolder,
    handleFolderSelect,
    handleNoteMove,
    handleShowFinderResults,
    revealFolderIds,
    revealNoteEntry,
    selectedFolder,
    selectedFolderLabel,
    selectedParentFolderId,
    toggleFolderCollapsed,
    visibleEntries,
  };
}
