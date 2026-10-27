import { describe, expect, it } from 'vitest';

import {
  extractNoteLinks,
  hackmdNoteKeys,
  hackmdRefKey,
  parseEmbedLine,
  hackmdEmbedRef,
  parseHackmdUrl,
  relativeVaultLink,
  resolveLocalLink,
} from './note-links';

describe('HackMD note references', () => {
  it('reads note URLs in their usual forms', () => {
    expect(parseHackmdUrl('https://hackmd.io/v8J7IYxzTxeLW-IKkpN8HQ')).toEqual({ kind: 'short', id: 'v8J7IYxzTxeLW-IKkpN8HQ' });
    expect(parseHackmdUrl('https://hackmd.io/v8J7IYxzTxeLW-IKkpN8HQ/edit?both#top')).toEqual({ kind: 'short', id: 'v8J7IYxzTxeLW-IKkpN8HQ' });
    expect(parseHackmdUrl('https://hackmd.io/s/abc123')).toEqual({ kind: 'short', id: 'abc123' });
    expect(parseHackmdUrl('https://hackmd.io/abc123.md')).toEqual({ kind: 'short', id: 'abc123' });
    expect(parseHackmdUrl('https://hackmd.io/@EastSun5566/purely-human-authored')).toEqual({ kind: 'named', owner: 'EastSun5566', slug: 'purely-human-authored' });
    expect(parseHackmdUrl('https://hackmd.io/%40team/%E7%AD%86%E8%A8%98')).toEqual({ kind: 'named', owner: 'team', slug: '筆記' });
    // HackMD pages and other sites are not notes.
    expect(parseHackmdUrl('https://hackmd.io/settings#api')).toBeNull();
    expect(parseHackmdUrl('https://hackmd.io/@team')).toBeNull();
    expect(parseHackmdUrl('https://example.com/abc123')).toBeNull();
    expect(parseHackmdUrl('javascript:alert(1)')).toBeNull();
  });

  it('reads embeds and previews, tidying pasted paths and URLs', () => {
    expect(parseEmbedLine('{%hackmd @EastSun5566/purely-human-authored %}')).toEqual({
      kind: 'embed', ref: { kind: 'named', owner: 'EastSun5566', slug: 'purely-human-authored' }, raw: '@EastSun5566/purely-human-authored',
    });
    expect(parseEmbedLine('{%hackmd ./plan?both %}')).toMatchObject({ ref: { kind: 'short', id: 'plan' }, raw: 'plan' });
    expect(parseEmbedLine('{%hackmd ../../@team/roadmap#goals %}')).toMatchObject({ ref: { kind: 'named', owner: 'team', slug: 'roadmap' } });
    expect(parseEmbedLine('{%hackmd https://hackmd.io/@team/roadmap %}')).toMatchObject({ ref: { kind: 'named', owner: 'team', slug: 'roadmap' } });
    // A folder-like path names no note HackDesk can match.
    expect(parseEmbedLine('{%hackmd ../notes/plan %}')).toEqual({ kind: 'embed', ref: null, raw: 'notes/plan' });
    expect(parseEmbedLine('  {%preview https://hackmd.io/v8J7IYxzTxeLW-IKkpN8HQ %}  ')).toEqual({ kind: 'preview', url: 'https://hackmd.io/v8J7IYxzTxeLW-IKkpN8HQ' });
    expect(parseEmbedLine('{%preview hackmd.io/no-protocol %}')).toBeNull();
    expect(parseEmbedLine('text {%hackmd abc %}')).toBeNull();
  });

  it('lists the keys a link to a note could use', () => {
    expect(hackmdNoteKeys({ id: 'long-id', shortId: 'abc', permalink: 'plan', userPath: 'me', teamPath: null })).toEqual([
      'hackmd:short:abc', 'hackmd:short:long-id', 'hackmd:named:me/plan', 'hackmd:named:me/abc',
    ]);
    expect(hackmdRefKey({ kind: 'named', owner: 'Me', slug: 'plan' })).toBe('hackmd:named:me/plan');
  });
});

describe('vault links', () => {
  it('resolves relative Markdown links inside the vault only', () => {
    expect(resolveLocalLink('notes/today.md', 'plan.md')).toBe('notes/plan.md');
    expect(resolveLocalLink('notes/today.md', '../archive/Old%20plan.md#goals')).toBe('archive/Old plan.md');
    expect(resolveLocalLink('notes/today.md', '/root.md')).toBe('root.md');
    expect(resolveLocalLink('today.md', '../outside.md')).toBeNull();
    expect(resolveLocalLink('today.md', 'image.png')).toBeNull();
    expect(resolveLocalLink('today.md', 'https://example.com/a.md')).toBeNull();
    expect(resolveLocalLink('today.md', '#section')).toBeNull();
  });

  it('collects links, embeds and previews, but not code or images', () => {
    const markdown = [
      'See [plan](./plan.md "Plan") and [web](https://hackmd.io/abc123).',
      '![diagram](./diagram.md)',
      'Bare https://hackmd.io/@team/roadmap and <https://hackmd.io/s/xyz>.',
      '{%hackmd @me/embedded %}',
      '{%preview https://hackmd.io/previewed %}',
      '`[not](./code.md)`',
      '```',
      '[also not](./fenced.md)',
      '```',
    ].join('\n');
    expect(extractNoteLinks(markdown, 'notes/today.md').sort()).toEqual([
      'hackmd:named:me/embedded',
      'hackmd:named:team/roadmap',
      'hackmd:short:abc123',
      'hackmd:short:previewed',
      'hackmd:short:xyz',
      'local:notes/plan.md',
    ]);
    // HackMD notes have no vault path, so their relative links point nowhere.
    expect(extractNoteLinks('[plan](./plan.md)', null)).toEqual([]);
  });
});

describe('writing links', () => {
  it('writes relative vault links that resolve back to the target', () => {
    const cases: [string, string][] = [
      ['notes/today.md', 'notes/plan.md'],
      ['notes/today.md', 'archive/Old plan.md'],
      ['today.md', 'notes/deep/a.md'],
      ['notes/deep/a.md', 'today.md'],
    ];
    for (const [from, to] of cases) expect(resolveLocalLink(from, relativeVaultLink(from, to))).toBe(to);
    expect(relativeVaultLink('notes/today.md', 'notes/plan.md')).toBe('./plan.md');
    expect(relativeVaultLink('notes/today.md', 'archive/Old plan.md')).toBe('../archive/Old%20plan.md');
  });

  it('names embeds by permalink when there is one', () => {
    expect(hackmdEmbedRef({ shortId: 'abc', permalink: 'plan', userPath: 'me', teamPath: null })).toBe('@me/plan');
    expect(hackmdEmbedRef({ shortId: 'abc', permalink: null, userPath: 'me', teamPath: null })).toBe('abc');
  });
});
