import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNoteIndexService } from './note-index-service';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function service(keepHackmdNotes = true) {
  const directory = await mkdtemp(join(tmpdir(), 'hackdesk-note-index-'));
  directories.push(directory);
  const path = join(directory, 'cache', 'notes.sqlite');
  return { path, index: createNoteIndexService({ path, keepHackmdNotes, readNotes: vi.fn(async () => []), log: vi.fn() }) };
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
});
