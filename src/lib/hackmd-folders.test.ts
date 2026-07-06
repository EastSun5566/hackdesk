import { describe, expect, it } from 'vitest';

import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from './hackmd-folders';
import type { NoteSummary } from './electron-api';

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    id: input.id,
    title: input.title,
    description: input.description ?? '',
    tags: input.tags ?? [],
    updatedAtMillis: input.updatedAtMillis ?? null,
    createdAtMillis: input.createdAtMillis ?? null,
    publishedAtMillis: input.publishedAtMillis ?? null,
    tagsUpdatedAtMillis: input.tagsUpdatedAtMillis ?? null,
    titleUpdatedAtMillis: input.titleUpdatedAtMillis ?? null,
    content: input.content ?? null,
    publishLink: input.publishLink ?? '',
    shortId: input.shortId ?? input.id,
    permalink: input.permalink ?? null,
    teamPath: input.teamPath ?? null,
    userPath: input.userPath ?? null,
    publishType: input.publishType ?? 'edit',
    readPermission: input.readPermission ?? 'owner',
    writePermission: input.writePermission ?? 'owner',
    lastChangeUser: input.lastChangeUser ?? null,
    folderPaths: input.folderPaths ?? [],
  };
}

describe('buildHackmdFolderTree', () => {
  it('builds nested folders from parentId and assigns notes only to the leaf folder', () => {
    const tree = buildHackmdFolderTree([
      note({
        id: 'note-1',
        title: 'Nested note',
        updatedAtMillis: 2000,
        folderPaths: [
          { id: 'root', name: 'Projects', icon: null, color: null, parentId: null, clientId: null },
          { id: 'child', name: 'Q2', icon: null, color: null, parentId: 'root', clientId: null },
        ],
      }),
    ]);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].id).toBe('root');
    expect(tree.roots[0].children[0].id).toBe('child');
    expect(tree.roots[0].notes).toEqual([]);
    expect(tree.roots[0].children[0].notes[0]).toMatchObject({
      note: { id: 'note-1' },
      folderLabel: 'Projects / Q2',
    });
    expect(tree.allNotes).toHaveLength(1);
    expect(tree.allNotes[0]).toMatchObject({
      note: { id: 'note-1' },
      folderLabel: 'Projects / Q2',
    });
  });

  it('falls back missing parents to root folders', () => {
    const tree = buildHackmdFolderTree([
      note({
        id: 'note-1',
        title: 'Orphan folder note',
        folderPaths: [
          { id: 'orphan', name: 'Orphan', icon: null, color: null, parentId: 'missing', clientId: null },
        ],
      }),
    ]);

    expect(tree.roots.map((folder) => folder.id)).toEqual(['orphan']);
    expect(tree.roots[0].parentId).toBeNull();
  });

  it('places notes without folders at the root without a visible folder label', () => {
    const tree = buildHackmdFolderTree([
      note({ id: 'note-1', title: 'Loose note' }),
    ]);

    expect(tree.unfiled.id).toBe(UNFILED_FOLDER_ID);
    expect(tree.unfiled.notes).toHaveLength(1);
    expect(tree.unfiled.notes[0]).toMatchObject({
      note: { id: 'note-1' },
      folderLabel: '',
    });
  });

  it('keeps API folders even when they have no notes', () => {
    const tree = buildHackmdFolderTree([], [
      { id: 'folder-1', name: 'Projects', icon: null, color: null, parentId: null, clientId: null },
      { id: 'folder-2', name: 'Q2', icon: null, color: null, parentId: 'folder-1', clientId: null },
    ]);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]).toMatchObject({ id: 'folder-1', name: 'Projects', notes: [] });
    expect(tree.roots[0].children[0]).toMatchObject({
      id: 'folder-2',
      name: 'Q2',
      notes: [],
    });
  });

  it('treats folderPaths as one ancestry path instead of multiple folder memberships', () => {
    const tree = buildHackmdFolderTree([
      note({
        id: 'note-1',
        title: 'Nested note',
        folderPaths: [
          { id: 'alpha', name: 'Alpha', icon: null, color: null, parentId: null, clientId: null },
          { id: 'beta', name: 'Beta', icon: null, color: null, parentId: 'alpha', clientId: null },
        ],
      }),
    ]);

    expect(tree.nodesById.get('alpha')?.notes).toEqual([]);
    expect(tree.nodesById.get('beta')?.notes.map((entry) => entry.note.id)).toEqual(['note-1']);
    expect(tree.allNotes.map((entry) => entry.folderLabel)).toEqual(['Alpha / Beta']);
  });

  it('sorts folders by name and notes by updated time descending', () => {
    const tree = buildHackmdFolderTree([
      note({
        id: 'older',
        title: 'Older',
        updatedAtMillis: 1000,
        folderPaths: [{ id: 'zeta', name: 'Zeta', icon: null, color: null, parentId: null, clientId: null }],
      }),
      note({
        id: 'newer',
        title: 'Newer',
        updatedAtMillis: 3000,
        folderPaths: [{ id: 'zeta', name: 'Zeta', icon: null, color: null, parentId: null, clientId: null }],
      }),
      note({
        id: 'alpha-note',
        title: 'Alpha',
        updatedAtMillis: 2000,
        folderPaths: [{ id: 'alpha', name: 'Alpha', icon: null, color: null, parentId: null, clientId: null }],
      }),
    ]);

    expect(tree.roots.map((folder) => folder.name)).toEqual(['Alpha', 'Zeta']);
    expect(tree.nodesById.get('zeta')?.notes.map((entry) => entry.note.id)).toEqual(['newer', 'older']);
  });

  it('sorts folders by HackMD folder order before falling back to names', () => {
    const tree = buildHackmdFolderTree([], [
      { id: 'alpha', name: 'Alpha', icon: null, color: null, parentId: null, clientId: null },
      { id: 'zeta', name: 'Zeta', icon: null, color: null, parentId: null, clientId: null },
      { id: 'beta', name: 'Beta', icon: null, color: null, parentId: null, clientId: null },
      { id: 'child-a', name: 'Child A', icon: null, color: null, parentId: 'zeta', clientId: null },
      { id: 'child-b', name: 'Child B', icon: null, color: null, parentId: 'zeta', clientId: null },
    ], {
      root: ['zeta', 'alpha'],
      zeta: ['child-b', 'child-a'],
    });

    expect(tree.roots.map((folder) => folder.id)).toEqual(['zeta', 'alpha', 'beta']);
    expect(tree.nodesById.get('zeta')?.children.map((folder) => folder.id)).toEqual(['child-b', 'child-a']);
  });
});
