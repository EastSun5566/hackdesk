import { describe, expect, it } from 'vitest';

import type { NoteSummary } from './electron-api';
import {
  escapeMarkdownLinkText,
  getHackmdNoteUrl,
  getMarkdownNoteLink,
  toOpenHackmdEditorInput,
} from './electron-note-links';

function note(input: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: input.id ?? 'note-1',
    title: input.title ?? 'Test note',
    description: input.description ?? '',
    tags: input.tags ?? [],
    updatedAtMillis: input.updatedAtMillis ?? null,
    createdAtMillis: input.createdAtMillis ?? null,
    publishedAtMillis: input.publishedAtMillis ?? null,
    tagsUpdatedAtMillis: input.tagsUpdatedAtMillis ?? null,
    titleUpdatedAtMillis: input.titleUpdatedAtMillis ?? null,
    content: input.content ?? null,
    publishLink: input.publishLink ?? '',
    shortId: input.shortId ?? 'note-1',
    permalink: input.permalink ?? null,
    teamPath: 'teamPath' in input ? input.teamPath ?? null : null,
    userPath: 'userPath' in input ? input.userPath ?? null : 'michael',
    publishType: input.publishType ?? 'edit',
    readPermission: input.readPermission ?? 'owner',
    writePermission: input.writePermission ?? 'owner',
    lastChangeUser: input.lastChangeUser ?? null,
    folderPaths: input.folderPaths ?? [],
  };
}

describe('electron note links', () => {
  it('builds HackMD URLs from note paths', () => {
    expect(getHackmdNoteUrl(note({ userPath: 'michael', permalink: 'roadmap' }))).toBe('https://hackmd.io/@michael/roadmap');
    expect(getHackmdNoteUrl(note({ userPath: null, publishType: 'view', shortId: 'abc123' }))).toBe('https://hackmd.io/s/abc123');
  });

  it('uses team publish links when available', () => {
    expect(getHackmdNoteUrl(note({
      teamPath: 'team',
      userPath: null,
      publishLink: 'https://hackmd.io/@team/roadmap?both#intro',
    }))).toBe('https://hackmd.io/@team/roadmap?both#intro');
  });

  it('escapes markdown link titles and falls back to Untitled', () => {
    expect(escapeMarkdownLinkText(String.raw`A [B]\C`)).toBe(String.raw`A \[B\]\\C`);
    expect(getMarkdownNoteLink(note({ title: 'A [B]' }))).toBe('[A \\[B\\]](https://hackmd.io/@michael/note-1)');
    expect(getMarkdownNoteLink(note({ title: '   ' }))).toBe('[Untitled](https://hackmd.io/@michael/note-1)');
  });

  it('normalizes notes before sending them to the open editor IPC channel', () => {
    expect(toOpenHackmdEditorInput(note({
      id: 'note-1',
      title: 'Extra fields should not cross IPC',
      shortId: 'abc123',
      teamPath: 'team',
      userPath: null,
      publishLink: 'https://hackmd.io/@team/abc123',
    }))).toEqual({
      publishType: 'edit',
      shortId: 'abc123',
      userPath: null,
      teamPath: 'team',
      permalink: null,
      publishLink: 'https://hackmd.io/@team/abc123',
    });
  });
});
