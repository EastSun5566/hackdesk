import type { DocumentSummary, NoteSummary, UserSummary } from '../../../../src/lib/electron-api';
import type { NoteStore } from './note-store';

/** The disk layer under the HackMD service's in-memory fallback; keys are the service's cache keys. */
export type HackmdDurableFallback = {
  read(key: string): unknown;
  write(key: string, value: unknown): void;
  invalidate(matches: (key: string) => boolean): void;
  clear(): void;
};

export const PERSONAL_WORKSPACE = 'personal';

const NOTE_KEY = /^(?:team:(.+):)?note:([^:]+)$/;
const LIST_KEY = /^(?:team:(.+):)?notes$/;

function noteKey(workspace: string, noteId: string) {
  return workspace === PERSONAL_WORKSPACE ? `note:${noteId}` : `team:${workspace}:note:${noteId}`;
}

/**
 * Keeps opened HackMD notes and list responses on disk, so a restart without a connection still
 * shows them as cached. A failing cache never breaks a HackMD read; it only logs.
 */
export function createHackmdOfflineCache(store: NoteStore, { enabled = true, log = () => undefined }: {
  enabled?: boolean;
  log?: (message: string, error: unknown) => void;
} = {}) {
  let on = enabled;

  function safely<T>(action: string, work: () => T): T | undefined {
    try {
      return work();
    } catch (error) {
      log(`Note cache: could not ${action}.`, error);
      return undefined;
    }
  }

  const fallback: HackmdDurableFallback & { setEnabled(next: boolean): void } = {
    setEnabled(next) {
      on = next;
      if (!next) safely('clear HackMD notes', () => store.clearHackmd());
    },

    read(key) {
      if (!on) return undefined;
      return safely('read', () => {
        const note = NOTE_KEY.exec(key);
        if (!note) return store.getResponse(key);
        const stored = store.getNote('hackmd', note[1] ?? PERSONAL_WORKSPACE, note[2]!);
        if (!stored?.meta) return undefined;
        return { ...JSON.parse(stored.meta) as Omit<DocumentSummary, 'content'>, content: stored.content } satisfies DocumentSummary;
      });
    },

    write(key, value) {
      if (!on) return;
      safely('save', () => {
        const note = NOTE_KEY.exec(key);
        if (note) {
          const { content, ...meta } = value as DocumentSummary;
          store.putNote({
            source: 'hackmd',
            workspace: note[1] ?? PERSONAL_WORKSPACE,
            noteId: note[2]!,
            title: meta.title,
            content,
            revision: meta.etag ?? null,
            meta: JSON.stringify(meta),
          });
          return;
        }
        if (key === 'currentUser') {
          // Another account's notes must never show up after switching tokens.
          const id = (value as UserSummary).id;
          const previous = store.getMeta('account_id');
          if (previous && previous !== id) store.clearHackmd();
          store.setMeta('account_id', id);
        }
        store.putResponse(key, value);
        const list = LIST_KEY.exec(key);
        // Deleted, moved or unshared notes leave the cache with the list that no longer has them.
        if (list) store.retainNotes('hackmd', list[1] ?? PERSONAL_WORKSPACE, (value as NoteSummary[]).map(item => item.id));
      });
    },

    invalidate(matches) {
      if (!on) return;
      safely('invalidate', () => {
        store.deleteResponses(matches);
        for (const { workspace, noteId } of store.noteKeys('hackmd')) {
          if (matches(noteKey(workspace, noteId))) store.deleteNote('hackmd', workspace, noteId);
        }
      });
    },

    clear() {
      safely('clear HackMD notes', () => store.clearHackmd());
    },
  };
  return fallback;
}

export type HackmdOfflineCache = ReturnType<typeof createHackmdOfflineCache>;
