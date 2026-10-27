import { setImmediate as yieldToEventLoop } from 'node:timers/promises';

import type { LocalNoteSummary, LocalVaultSnapshot } from '../../../../src/lib/local-vault';
import type { NoteStore } from './note-store';

const BATCH_SIZE = 200;

export type ReadNotesForIndex = (snapshot: LocalVaultSnapshot, notes: readonly LocalNoteSummary[]) => Promise<{
  note: LocalNoteSummary;
  content: string;
  contentHash: string;
}[]>;

/**
 * Brings the vault's search index in line with a scan: reads only notes whose content hash changed,
 * in batches that let the main process breathe, and drops notes the scan no longer has.
 */
export async function indexLocalVault(store: NoteStore, snapshot: LocalVaultSnapshot, readNotes: ReadNotesForIndex) {
  const known = store.revisions('local', snapshot.vaultId);
  const changed = snapshot.notes.filter(note => known.get(note.id) !== note.revision.contentHash);
  for (let start = 0; start < changed.length; start += BATCH_SIZE) {
    const read = await readNotes(snapshot, changed.slice(start, start + BATCH_SIZE));
    store.putNotes(read.map(({ note, content, contentHash }) => ({
      source: 'local',
      workspace: snapshot.vaultId,
      noteId: note.id,
      title: note.title,
      content,
      revision: contentHash,
      meta: JSON.stringify({ relativePath: note.relativePath }),
    })));
    await yieldToEventLoop();
  }
  store.retainNotes('local', snapshot.vaultId, snapshot.notes.map(note => note.id));
  return { indexed: changed.length };
}
