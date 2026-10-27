import { rmSync } from 'node:fs';

import type { LocalVaultSnapshot } from '../../../../src/lib/local-vault';
import type { NoteIndexStatus, NoteSearchInput, NoteSearchResponse } from '../../../../src/lib/note-index';
import {
  createHackmdOfflineCache,
  PERSONAL_WORKSPACE,
  type HackmdDurableFallback,
  type HackmdOfflineCache,
} from './hackmd-offline-cache';
import { indexLocalVault, type ReadNotesForIndex } from './local-vault-index';
import { openNoteStore, type NoteStore } from './note-store';

type Log = (message: string, error?: unknown) => void;

const EMPTY_STATUS: NoteIndexStatus = { hackmdNotes: 0, hackmdBytes: 0, localNotes: 0 };

/** A damaged cache file is replaced; without a usable store, HackDesk runs as before, with no index. */
function openStoreOrRebuild(path: string, log: Log): NoteStore | null {
  try {
    return openNoteStore(path, { log });
  } catch (error) {
    log('Note cache: could not open it; starting a new one.', error);
  }
  try {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
    return openNoteStore(path, { log });
  } catch (error) {
    log('Note cache: unavailable; offline reading and text search are off.', error);
    return null;
  }
}

export function createNoteIndexService({ path, readNotes, keepHackmdNotes = true, log }: {
  path: string;
  readNotes: ReadNotesForIndex;
  keepHackmdNotes?: boolean;
  log: Log;
}) {
  let keepHackmd = keepHackmdNotes;
  // Opened on first use, so starting HackDesk, or quitting before it opens, writes nothing.
  let opened: { store: NoteStore | null; hackmd: HackmdOfflineCache | null } | null = null;
  const open = () => {
    if (!opened) {
      const store = openStoreOrRebuild(path, log);
      opened = { store, hackmd: store ? createHackmdOfflineCache(store, { enabled: keepHackmd, log }) : null };
    }
    return opened;
  };
  // One vault update at a time, so an older scan cannot finish after a newer one.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = (task: (store: NoteStore) => unknown) => {
    const next = queue.then(() => {
      const { store } = open();
      return store ? task(store) : undefined;
    }).catch(error => log('Note cache: could not index the vault.', error));
    queue = next;
    return next;
  };

  /** The disk layer for the HackMD service's fallback cache. */
  const hackmdFallback: HackmdDurableFallback = {
    read: key => (keepHackmd ? open().hackmd?.read(key) : undefined),
    write: (key, value) => { if (keepHackmd) open().hackmd?.write(key, value); },
    invalidate: (matches) => { if (keepHackmd) open().hackmd?.invalidate(matches); },
    clear: () => open().hackmd?.clear(),
  };

  return {
    hackmdFallback,

    setKeepHackmdNotes(enabled: boolean) {
      keepHackmd = enabled;
      // Turning it off also removes what an earlier session kept.
      if (opened || !enabled) open().hackmd?.setEnabled(enabled);
    },

    /** Indexes the active vault and forgets any other vault's index. */
    indexVault(snapshot: LocalVaultSnapshot) {
      return enqueue(async (store) => {
        store.keepOnlyWorkspace('local', snapshot.vaultId);
        await indexLocalVault(store, snapshot, readNotes);
      });
    },

    forgetVaults() {
      return enqueue(store => store.keepOnlyWorkspace('local', null));
    },

    search({ query, scope, limit }: NoteSearchInput): NoteSearchResponse {
      if (scope.type === 'hackmd' && !keepHackmd) return { matches: [], indexedCount: 0 };
      const { store } = open();
      if (!store) return { matches: [], indexedCount: 0 };
      return store.search({
        query,
        limit,
        source: scope.type === 'local' ? 'local' : 'hackmd',
        workspace: scope.type === 'local' ? scope.vaultId : scope.teamPath ?? PERSONAL_WORKSPACE,
      });
    },

    status(): NoteIndexStatus {
      return open().store?.status() ?? EMPTY_STATUS;
    },

    async close() {
      await queue;
      opened?.store?.close();
    },
  };
}

