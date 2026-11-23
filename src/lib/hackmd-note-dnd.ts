import { isRootFolderDropTarget, parseFolderContentDropId } from './hackmd-folder-dnd';
import { UNFILED_FOLDER_ID, type FolderTree, type FolderTreeNote } from './hackmd-folders';

const NOTE_DRAG_ID_PREFIX = 'note:';

export type NoteDropOperation = {
  note: FolderTreeNote;
  targetFolderId: string | null;
  changed: boolean;
};

export function buildNoteDragId(noteId: string) {
  return `${NOTE_DRAG_ID_PREFIX}${noteId}`;
}

export function parseNoteDragId(value: string) {
  return value.startsWith(NOTE_DRAG_ID_PREFIX)
    ? value.slice(NOTE_DRAG_ID_PREFIX.length)
    : null;
}

export function getNoteCurrentFolderId(note: FolderTreeNote) {
  return note.folderPath.at(-1)?.id ?? null;
}

export function buildNoteDropOperation({
  tree,
  activeId,
  overId,
}: {
  tree: FolderTree;
  activeId: string;
  overId: string | null;
}): NoteDropOperation | null {
  const noteId = parseNoteDragId(activeId);
  if (!noteId || !overId || overId === UNFILED_FOLDER_ID) {
    return null;
  }

  const note = tree.allNotes.find((entry) => entry.note.id === noteId);
  if (!note) {
    return null;
  }

  const currentFolderId = getNoteCurrentFolderId(note);
  if (isRootFolderDropTarget(overId)) {
    return {
      note,
      targetFolderId: null,
      changed: currentFolderId !== null,
    };
  }

  const overNoteId = parseNoteDragId(overId);
  const overNote = overNoteId ? tree.allNotes.find((entry) => entry.note.id === overNoteId) : null;
  if (overNoteId && !overNote) {
    return null;
  }
  const contentFolderId = parseFolderContentDropId(overId);
  const targetFolderId = overNoteId
    ? getNoteCurrentFolderId(overNote!)
    : contentFolderId
      ? contentFolderId
      : overId === UNFILED_FOLDER_ID
      ? null
      : tree.nodesById.get(overId)?.id;
  if (targetFolderId === undefined) {
    return null;
  }

  return {
    note,
    targetFolderId,
    changed: currentFolderId !== targetFolderId,
  };
}
