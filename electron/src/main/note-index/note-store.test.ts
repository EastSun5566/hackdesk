import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { MATCH_END, MATCH_START } from './note-search';
import { MAX_CACHED_HACKMD_NOTES, openNoteStore, type StoredNote } from './note-store';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

function note(noteId: string, content: string, overrides: Partial<StoredNote> = {}): StoredNote {
  return { source: 'local', workspace: 'vault-1', noteId, title: noteId, content, revision: 'r1', meta: null, ...overrides };
}

describe('note store', () => {
  it('finds Chinese and English text with a marked snippet, quoting what the user typed', () => {
    const store = openNoteStore(':memory:');
    store.putNotes([
      note('meeting', '今天討論 HackDesk 的離線閱讀與全文搜尋。Offline search ships next.'),
      note('other', 'Nothing to see here "quoted" AND OR NOT'),
    ]);
    const chinese = store.search({ query: '離線閱讀', source: 'local', workspace: 'vault-1' });
    expect(chinese.matches.map(match => match.noteId)).toEqual(['meeting']);
    expect(chinese.matches[0]!.snippet).toContain(`${MATCH_START}離線閱讀${MATCH_END}`);
    expect(store.search({ query: 'OFFLINE search', source: 'local', workspace: 'vault-1' }).matches).toHaveLength(1);
    expect(store.search({ query: '"quoted" AND', source: 'local', workspace: 'vault-1' }).matches.map(match => match.noteId)).toEqual(['other']);
    expect(store.search({ query: 'missing words', source: 'local', workspace: 'vault-1' })).toEqual({ matches: [], indexedCount: 2 });
  });

  it('marks the text around a match found only in the title', () => {
    const store = openNoteStore(':memory:');
    store.putNotes([note('Roadmap 2027', 'Plans for the roadmap ahead.', { title: 'Roadmap 2027' })]);
    store.putNotes([note('Untitled', 'Nothing here.', { title: 'Quarterly roadmap' })]);
    const [planned, titleOnly] = ['Roadmap 2027', 'Untitled'].map(noteId => store.search({ query: 'roadmap', source: 'local', workspace: 'vault-1' })
      .matches.find(match => match.noteId === noteId)!);
    expect(planned.snippet).toContain(`${MATCH_START}roadmap${MATCH_END}`);
    // No marker to show when only the title matched, and no stray text either.
    expect(titleOnly.snippet).toBe('Nothing here.');
  });

  it('counts the cache size in bytes, including Chinese text', () => {
    const store = openNoteStore(':memory:');
    store.putNote(note('n1', '中文', { source: 'hackmd', workspace: 'personal' }));
    store.putResponse('notes', '中');
    // Two 3-byte characters, plus `"中"` as JSON: 1 + 3 + 1 bytes.
    expect(store.status().hackmdBytes).toBe(6 + 5);
  });

  it('falls back to scanning for one- and two-character queries', () => {
    const store = openNoteStore(':memory:');
    store.putNotes([note('a', '這是搜尋測試'), note('b', 'plain 100% text_x')]);
    const short = store.search({ query: '搜', source: 'local', workspace: 'vault-1' });
    expect(short.matches.map(match => match.noteId)).toEqual(['a']);
    expect(short.matches[0]!.snippet).toBe(`這是${MATCH_START}搜${MATCH_END}尋測試`);
    // LIKE wildcards in the query are literal.
    expect(store.search({ query: '%', source: 'local', workspace: 'vault-1' }).matches.map(match => match.noteId)).toEqual(['b']);
    expect(store.search({ query: '_x', source: 'local', workspace: 'vault-1' }).matches.map(match => match.noteId)).toEqual(['b']);
  });

  it('keeps workspaces apart, updates in place, and drops notes that left a workspace', () => {
    const store = openNoteStore(':memory:');
    store.putNotes([note('a', 'alpha text'), note('b', 'beta text'), note('c', 'alpha text', { workspace: 'vault-2' })]);
    store.putNote(note('a', 'gamma text', { revision: 'r2' }));
    expect(store.search({ query: 'alpha', source: 'local', workspace: 'vault-1' }).matches).toEqual([]);
    expect(store.search({ query: 'gamma', source: 'local', workspace: 'vault-1' }).matches.map(match => match.noteId)).toEqual(['a']);
    expect(store.revisions('local', 'vault-1')).toEqual(new Map([['a', 'r2'], ['b', 'r1']]));
    store.retainNotes('local', 'vault-1', ['a']);
    expect(store.getNote('local', 'vault-1', 'b')).toBeNull();
    expect(store.getNote('local', 'vault-2', 'c')).not.toBeNull();
    store.clearWorkspace('local', 'vault-2');
    expect(store.status().localNotes).toBe(1);
  });

  it('keeps only the most recently opened HackMD notes and clears HackMD on request', () => {
    const store = openNoteStore(':memory:');
    for (let index = 0; index <= MAX_CACHED_HACKMD_NOTES; index += 1) {
      store.putNote(note(`n${index}`, `note ${index}`, { source: 'hackmd', workspace: 'personal' }));
    }
    store.putNote(note('local', 'stays', { source: 'local' }));
    store.putResponse('notes', [{ id: 'n1' }]);
    store.setMeta('account_id', 'user-1');
    expect(store.status().hackmdNotes).toBe(MAX_CACHED_HACKMD_NOTES);
    store.clearHackmd();
    expect(store.status()).toMatchObject({ hackmdNotes: 0, localNotes: 1 });
    expect(store.getResponse('notes')).toBeUndefined();
    expect(store.getMeta('account_id')).toBeNull();
  });

  it('keeps each note\'s links current and answers backlinks across vaults and HackMD', () => {
    const store = openNoteStore(':memory:');
    const vaultNote = (noteId: string, path: string, content: string) => note(noteId, content, { meta: JSON.stringify({ relativePath: path }) });
    store.putNotes([
      vaultNote('a', 'notes/a.md', 'See [B](./b.md) and https://hackmd.io/@me/plan'),
      vaultNote('b', 'notes/b.md', 'Nothing linked.'),
    ]);
    store.putNote(note('h1', '{%hackmd @me/plan %}', { source: 'hackmd', workspace: 'personal', title: 'Embedding note' }));

    expect(store.backlinks(['local:notes/b.md']).map(linking => linking.noteId)).toEqual(['a']);
    expect(store.backlinks(['hackmd:named:me/plan']).map(linking => linking.title).sort()).toEqual(['Embedding note', 'a']);

    store.putNote(vaultNote('a', 'notes/a.md', 'No links any more.'));
    expect(store.backlinks(['local:notes/b.md'])).toEqual([]);
    store.deleteNote('hackmd', 'personal', 'h1');
    expect(store.backlinks(['hackmd:named:me/plan'])).toEqual([]);
    expect(store.findLocalNoteByPath('vault-1', 'notes/b.md')).toMatchObject({ noteId: 'b', title: 'b' });
    expect(store.findLocalNoteByPath('vault-1', 'notes/missing.md')).toBeNull();
  });

  it('finds HackMD notes from opened copies and from the cached workspace lists', () => {
    const store = openNoteStore(':memory:');
    const summary = { id: 'long-1', shortId: 'abc', permalink: 'roadmap', userPath: null, teamPath: 'team-a', title: 'Roadmap' };
    store.putResponse('team:team-a:notes', [summary]);
    expect(store.findHackmdNote({ kind: 'short', id: 'abc' })).toEqual({ noteId: 'long-1', teamPath: 'team-a', title: 'Roadmap', shortId: 'abc', snippet: null });
    expect(store.findHackmdNote({ kind: 'named', owner: 'TEAM-A', slug: 'roadmap' })).toMatchObject({ noteId: 'long-1' });
    expect(store.findHackmdNote({ kind: 'short', id: 'missing' })).toBeNull();

    store.putNote(note('long-1', 'Roadmap body text', { source: 'hackmd', workspace: 'team-a', meta: JSON.stringify(summary) }));
    expect(store.findHackmdNote({ kind: 'short', id: 'long-1' })).toMatchObject({ snippet: 'Roadmap body text' });
  });

  it('is private to this account and rebuilds when its schema is outdated', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hackdesk-note-store-'));
    directories.push(directory);
    const path = join(directory, 'cache', 'notes.sqlite');
    const first = openNoteStore(path);
    first.putNote(note('a', 'kept text'));
    first.close();
    if (process.platform !== 'win32') {
      expect((await stat(join(directory, 'cache'))).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }

    const raw = new DatabaseSync(path);
    raw.prepare("update meta set value = '0' where key = 'schema_version'").run();
    raw.close();
    const messages: string[] = [];
    const second = openNoteStore(path, { log: message => messages.push(message) });
    expect(second.status().localNotes).toBe(0);
    expect(messages[0]).toContain('Rebuilding the note cache');
    second.close();
  });
});
