import { describe, expect, it } from 'vitest';

import type { FolderSummary, NoteSummary } from './electron-api';
import { ROOT_FOLDER_DROP_ID } from './hackmd-folder-dnd';
import {
  buildNoteDragId,
  buildNoteDropOperation,
  getNoteCurrentFolderId,
  parseNoteDragId,
} from './hackmd-note-dnd';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from './hackmd-folders';

const folder: FolderSummary = {
  id: 'folder-1',
  name: 'Projects',
  description: null,
  icon: null,
  color: null,
  parentId: null,
  clientId: null,
  createdAtMillis: 1,
  updatedAtMillis: 1,
};

const otherFolder: FolderSummary = {
  ...folder,
  id: 'folder-2',
  name: 'Archive',
};

const note: NoteSummary = {
  id: 'note-1',
  title: 'Test note',
  description: '',
  tags: [],
  updatedAtMillis: 1,
  createdAtMillis: 1,
  publishedAtMillis: null,
  tagsUpdatedAtMillis: null,
  titleUpdatedAtMillis: null,
  content: null,
  publishLink: 'https://hackmd.io/s/note-1',
  shortId: 'note-1',
  permalink: null,
  teamPath: null,
  userPath: 'michael',
  publishType: 'edit',
  readPermission: 'guest',
  writePermission: 'owner',
  lastChangeUser: null,
  folderPaths: [folder],
};

describe('note dnd helpers', () => {
  it('builds and parses note drag IDs', () => {
    expect(buildNoteDragId('note-1')).toBe('note:note-1');
    expect(parseNoteDragId('note:note-1')).toBe('note-1');
    expect(parseNoteDragId('folder-1')).toBeNull();
  });

  it('builds a move operation for concrete folder drops', () => {
    const tree = buildHackmdFolderTree([note], [folder, otherFolder]);
    const operation = buildNoteDropOperation({
      tree,
      activeId: buildNoteDragId(note.id),
      overId: otherFolder.id,
    });

    expect(operation).toMatchObject({
      targetFolderId: otherFolder.id,
      changed: true,
    });
    expect(operation?.note.note.id).toBe(note.id);
  });

  it('marks same-folder drops unchanged', () => {
    const tree = buildHackmdFolderTree([note], [folder]);

    expect(buildNoteDropOperation({
      tree,
      activeId: buildNoteDragId(note.id),
      overId: folder.id,
    })?.changed).toBe(false);
    expect(getNoteCurrentFolderId(tree.allNotes[0])).toBe(folder.id);
  });

  it('builds a root move operation with null target folder id', () => {
    const tree = buildHackmdFolderTree([note], [folder]);
    const operation = buildNoteDropOperation({
      tree,
      activeId: buildNoteDragId(note.id),
      overId: ROOT_FOLDER_DROP_ID,
    });

    expect(operation).toMatchObject({
      targetFolderId: null,
      changed: true,
    });
  });

  it('marks root-to-root drops unchanged', () => {
    const rootNote = { ...note, folderPaths: [] };
    const tree = buildHackmdFolderTree([rootNote], [folder]);

    expect(buildNoteDropOperation({
      tree,
      activeId: buildNoteDragId(rootNote.id),
      overId: ROOT_FOLDER_DROP_ID,
    })?.changed).toBe(false);
    expect(getNoteCurrentFolderId(tree.allNotes[0])).toBeNull();
  });

  it('rejects unfiled, unknown, and non-note drops', () => {
    const tree = buildHackmdFolderTree([note], [folder]);

    expect(buildNoteDropOperation({ tree, activeId: buildNoteDragId(note.id), overId: UNFILED_FOLDER_ID })).toBeNull();
    expect(buildNoteDropOperation({ tree, activeId: buildNoteDragId(note.id), overId: 'missing-folder' })).toBeNull();
    expect(buildNoteDropOperation({ tree, activeId: folder.id, overId: otherFolder.id })).toBeNull();
  });
});
