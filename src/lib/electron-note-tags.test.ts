import { describe, expect, it } from 'vitest';

import type { NoteSummary } from './electron-api';
import { buildHackmdFolderTree } from './hackmd-folders';
import { buildNoteTagIndex } from './electron-note-tags';

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

describe('electron note tags', () => {
  it('builds a tag index with count, latest update, and stable sorting', () => {
    const tree = buildHackmdFolderTree([
      note({ id: 'one', title: 'One', tags: ['product', 'design'], updatedAtMillis: 100 }),
      note({ id: 'two', title: 'Two', tags: ['product'], updatedAtMillis: 300 }),
      note({ id: 'three', title: 'Three', tags: ['alpha'], updatedAtMillis: 200 }),
    ]);

    expect(buildNoteTagIndex(tree.allNotes)).toEqual([
      { tag: 'product', count: 2, latestUpdatedAtMillis: 300 },
      { tag: 'alpha', count: 1, latestUpdatedAtMillis: 200 },
      { tag: 'design', count: 1, latestUpdatedAtMillis: 100 },
    ]);
  });

  it('counts duplicate tags once per note', () => {
    const tree = buildHackmdFolderTree([
      note({ id: 'one', title: 'One', tags: ['product', ' product ', 'design'], updatedAtMillis: 100 }),
      note({ id: 'two', title: 'Two', tags: ['product'], updatedAtMillis: 200 }),
    ]);

    expect(buildNoteTagIndex(tree.allNotes)).toEqual([
      { tag: 'product', count: 2, latestUpdatedAtMillis: 200 },
      { tag: 'design', count: 1, latestUpdatedAtMillis: 100 },
    ]);
  });

  it('ignores empty and whitespace-only tags', () => {
    const tree = buildHackmdFolderTree([
      note({ id: 'one', title: 'One', tags: ['', '   ', 'product'], updatedAtMillis: 100 }),
    ]);

    expect(buildNoteTagIndex(tree.allNotes)).toEqual([
      { tag: 'product', count: 1, latestUpdatedAtMillis: 100 },
    ]);
  });
});
