import { describe, expect, it } from 'vitest';

import type { NoteSummary } from '@/lib/electron-api';
import type { FolderTreeNote } from '@/lib/hackmd-folders';

import {
  createTagGroupFocusId,
  DEFAULT_TAG_GROUP_ORDER,
  getTagGroupLabel,
  groupNotesByFirstTag,
  normalizeTagGroupOrder,
} from './electron-tag-groups';

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    content: input.content ?? null,
    createdAtMillis: input.createdAtMillis ?? null,
    description: input.description ?? '',
    folderPaths: input.folderPaths ?? [],
    id: input.id,
    lastChangeUser: input.lastChangeUser ?? null,
    permalink: input.permalink ?? null,
    publishLink: input.publishLink ?? `https://hackmd.io/${input.id}`,
    publishedAtMillis: input.publishedAtMillis ?? null,
    publishType: input.publishType ?? 'edit',
    readPermission: input.readPermission ?? 'owner',
    shortId: input.shortId ?? input.id,
    tags: input.tags ?? [],
    tagsUpdatedAtMillis: input.tagsUpdatedAtMillis ?? null,
    teamPath: input.teamPath ?? null,
    title: input.title,
    titleUpdatedAtMillis: input.titleUpdatedAtMillis ?? null,
    updatedAtMillis: input.updatedAtMillis ?? null,
    userPath: input.userPath ?? null,
    writePermission: input.writePermission ?? 'owner',
  };
}

function entry(id: string, title: string, tags: string[], updatedAtMillis: number | null = null): FolderTreeNote {
  return { note: note({ id, tags, title, updatedAtMillis }), folderLabel: '', folderPath: [] };
}

describe('tag groups', () => {
  it('groups root notes under their first tag; ties keep note order', () => {
    const groups = groupNotesByFirstTag([
      entry('planning', 'Planning', ['work', 'later']),
      entry('ideas', 'Ideas', [' personal ']),
      entry('next', 'Next', ['work']),
    ], DEFAULT_TAG_GROUP_ORDER);

    expect(groups.map((group) => group.tag)).toEqual(['work', 'personal']);
    expect(groups[0].entries.map((candidate) => candidate.note.id)).toEqual(['planning', 'next']);
    expect(groups[1].entries.map((candidate) => candidate.note.id)).toEqual(['ideas']);
  });

  it('sorts the Untagged group with the rest, not pinned to an end', () => {
    // The untagged group competes on its newest note in an updated-time order...
    const groups = groupNotesByFirstTag([
      entry('work1', 'Work One', ['work'], 100),
      entry('daily', 'Daily Log', [], 500),
    ], 'updated-desc');
    expect(groups.map((group) => group.tag)).toEqual(['', 'work']);

    // ...and by its name in the a-z order.
    const named = groupNotesByFirstTag([
      entry('work1', 'Work One', ['work']),
      entry('daily', 'Daily Log', []),
    ], 'a-z');
    expect(named.map((group) => group.tag)).toEqual(['', 'work']);
  });

  it('orders groups by their newest note, newest first by default', () => {
    const notes = [
      entry('w1', 'Work One', ['work'], 100),
      entry('p1', 'Personal One', ['personal'], 200),
      entry('l1', 'Later One', ['later'], 300),
    ];

    expect(groupNotesByFirstTag(notes, 'updated-desc').map((group) => group.tag)).toEqual(['later', 'personal', 'work']);
    expect(groupNotesByFirstTag(notes, 'updated-asc').map((group) => group.tag)).toEqual(['work', 'personal', 'later']);
  });

  it('orders groups by tag name when asked', () => {
    const groups = groupNotesByFirstTag([
      entry('b1', 'B One', ['banana']),
      entry('a1', 'A One', ['apple']),
      entry('c1', 'C One', ['cherry']),
    ], 'a-z');

    expect(groups.map((group) => group.tag)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('ranks groups without dates last within an updated order', () => {
    const groups = groupNotesByFirstTag([
      entry('w1', 'Work One', ['work'], 100),
      entry('u1', 'Undated', ['later']),
    ], 'updated-asc');

    expect(groups.map((group) => group.tag)).toEqual(['work', 'later']);
  });

  it('normalizes the order option from storage', () => {
    expect(normalizeTagGroupOrder('updated-desc')).toBe('updated-desc');
    expect(normalizeTagGroupOrder('updated-asc')).toBe('updated-asc');
    expect(normalizeTagGroupOrder('a-z')).toBe('a-z');
    expect(normalizeTagGroupOrder('junk')).toBe(DEFAULT_TAG_GROUP_ORDER);
    expect(normalizeTagGroupOrder(null)).toBe(DEFAULT_TAG_GROUP_ORDER);
  });

  it('names the untagged group and identifies its rows', () => {
    expect(getTagGroupLabel('work')).toBe('work');
    expect(getTagGroupLabel('')).toBe('Untagged');
    expect(createTagGroupFocusId('work')).toBe('tag:work');
    expect(createTagGroupFocusId('')).toBe('tag:__untagged__');
  });
});
