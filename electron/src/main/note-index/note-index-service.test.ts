import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LocalNoteSummary } from '../../../../src/lib/local-vault';
import { createNoteIndexService } from './note-index-service';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function service(keepHackmdNotes = true, files: Record<string, string> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'hackdesk-note-index-'));
  directories.push(directory);
  const path = join(directory, 'cache', 'notes.sqlite');
  const readNotes = vi.fn(async (_snapshot: unknown, notes: readonly LocalNoteSummary[]) => notes.map(note => ({
    note, content: files[note.relativePath] ?? '', contentHash: note.revision.contentHash,
  })));
  return { path, index: createNoteIndexService({ path, keepHackmdNotes, readNotes, log: vi.fn() }) };
}

function vaultNote(relativePath: string): LocalNoteSummary {
  return { id: relativePath, title: relativePath, relativePath, parentPath: null, createdAtMillis: null, updatedAtMillis: null, revision: { contentHash: 'h', mtimeMs: 0 } };
}

const exists = (path: string) => access(path).then(() => true, () => false);

describe('note index service', () => {
  it('writes nothing until the cache is first used', async () => {
    const { path, index } = await service();
    index.setKeepHackmdNotes(true);
    expect(await exists(path)).toBe(false);
    expect(index.search({ query: 'text', scope: { type: 'hackmd', teamPath: null } })).toEqual({ matches: [], indexedCount: 0 });
    expect(await exists(path)).toBe(true);
    await index.close();
  });

  it('stops keeping and searching HackMD notes when turned off', async () => {
    const { index } = await service();
    index.hackmdFallback.write('note:n1', { id: 'n1', title: 'Kept', content: 'kept text', etag: null });
    expect(index.status().hackmdNotes).toBe(1);
    index.setKeepHackmdNotes(false);
    expect(index.status().hackmdNotes).toBe(0);
    index.hackmdFallback.write('note:n2', { id: 'n2', title: 'Skipped', content: 'skipped text', etag: null });
    expect(index.status().hackmdNotes).toBe(0);
    expect(index.search({ query: 'text', scope: { type: 'hackmd', teamPath: null } }).indexedCount).toBe(0);
    await index.close();
  });

  it('resolves vault links by path and lists the notes linking back', async () => {
    const { index } = await service(true, { 'notes/a.md': 'See [B](./b.md).', 'notes/b.md': 'B body' });
    await index.indexVault({ vaultId: 'vault-1', rootPath: '/vault', notes: [vaultNote('notes/a.md'), vaultNote('notes/b.md')], folders: [] });
    const from = { source: 'local', vaultId: 'vault-1', noteId: 'notes/a.md' } as const;

    expect(index.resolveLink({ target: './b.md', kind: 'url', from })).toMatchObject({ kind: 'local', vaultId: 'vault-1', noteId: 'notes/b.md', snippet: 'B body' });
    expect(index.resolveLink({ target: '../../outside.md', kind: 'url', from })).toBeNull();
    expect(index.backlinks({ target: { source: 'local', vaultId: 'vault-1', noteId: 'notes/b.md' } })).toEqual({
      notes: [{ kind: 'local', vaultId: 'vault-1', noteId: 'notes/a.md', title: 'notes/a.md', snippet: null }],
      hackmdIndexed: 0,
    });
    await index.close();
  });

  it('resolves HackMD embeds from local data only, and only while HackMD notes are kept', async () => {
    const { index } = await service();
    index.hackmdFallback.write('notes', [{ id: 'n2', shortId: 'plan2', permalink: 'plan', userPath: 'me', teamPath: null, title: 'Plan' }]);
    index.hackmdFallback.write('note:n1', { id: 'n1', shortId: 's1', title: 'Embedding', content: '{%hackmd @me/plan %}', etag: null });
    const from = { source: 'hackmd', teamPath: null, noteId: 'n1' } as const;

    expect(index.resolveLink({ target: '@me/plan', kind: 'embed', from })).toEqual({ kind: 'hackmd', noteId: 'n2', teamPath: null, title: 'Plan', shortId: 'plan2', snippet: null });
    expect(index.backlinks({ target: { source: 'hackmd', id: 'n2', shortId: 'plan2', permalink: 'plan', userPath: 'me', teamPath: null } })).toEqual({
      notes: [{ kind: 'hackmd', noteId: 'n1', teamPath: null, title: 'Embedding', shortId: 's1', snippet: null }],
      hackmdIndexed: 1,
    });

    index.setKeepHackmdNotes(false);
    expect(index.resolveLink({ target: 'https://hackmd.io/@me/plan', kind: 'url', from })).toBeNull();
    await index.close();
  });
});
