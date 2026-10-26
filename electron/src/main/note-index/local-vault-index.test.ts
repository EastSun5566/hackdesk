import { describe, expect, it, vi } from 'vitest';

import type { LocalNoteSummary, LocalVaultSnapshot } from '../../../../src/lib/local-vault';
import { indexLocalVault, type ReadNotesForIndex } from './local-vault-index';
import { openNoteStore } from './note-store';

function summary(id: string, contentHash: string): LocalNoteSummary {
  return { id, title: id, relativePath: `${id}.md`, parentPath: null, createdAtMillis: null, updatedAtMillis: null, revision: { contentHash, mtimeMs: 0 } };
}

function snapshot(notes: LocalNoteSummary[]): LocalVaultSnapshot {
  return { vaultId: 'vault-1', rootPath: '/vault', notes, folders: [] };
}

describe('Local Vault index', () => {
  it('reads only changed notes and drops notes that left the vault', async () => {
    const store = openNoteStore(':memory:');
    const files: Record<string, string> = { a: 'first note text', b: 'second note text' };
    const readNotes = vi.fn<ReadNotesForIndex>(async (_snapshot, notes) => notes.map(note => ({
      note, content: files[note.id]!, contentHash: note.revision.contentHash,
    })));

    await indexLocalVault(store, snapshot([summary('a', 'h1'), summary('b', 'h1')]), readNotes);
    expect(readNotes.mock.calls[0]![1].map(note => note.id)).toEqual(['a', 'b']);

    files.b = 'second note rewritten';
    await expect(indexLocalVault(store, snapshot([summary('a', 'h1'), summary('b', 'h2')]), readNotes)).resolves.toEqual({ indexed: 1 });
    expect(readNotes.mock.calls[1]![1].map(note => note.id)).toEqual(['b']);
    expect(store.search({ query: 'rewritten', source: 'local', workspace: 'vault-1' }).matches.map(match => match.noteId)).toEqual(['b']);

    await indexLocalVault(store, snapshot([summary('b', 'h2')]), readNotes);
    expect(readNotes).toHaveBeenCalledTimes(2);
    expect(store.search({ query: 'first', source: 'local', workspace: 'vault-1' }).indexedCount).toBe(1);
  });

  it('reads a large vault in batches', async () => {
    const store = openNoteStore(':memory:');
    const notes = Array.from({ length: 450 }, (_, index) => summary(`n${index}`, 'h'));
    const readNotes = vi.fn<ReadNotesForIndex>(async (_snapshot, batch) => batch.map(note => ({ note, content: `body ${note.id}`, contentHash: 'h' })));
    await indexLocalVault(store, snapshot(notes), readNotes);
    expect(readNotes.mock.calls.map(call => call[1].length)).toEqual([200, 200, 50]);
    expect(store.status().localNotes).toBe(450);
  });
});
