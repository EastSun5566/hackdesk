import { useCallback } from 'react';

import { toast } from '@/components/ui/toast';
import type { DocumentSummary } from '@/lib/electron-api';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import type { NoteLinkSource, NoteLinkTarget } from '@/lib/note-index';
import { parseHackmdUrl } from '@/lib/note-links';
import { getHackDeskAPI } from '@/lib/electron-api';
import { getHackmdNoteUrl } from '@/lib/electron-note-links';

import { getLocalImageContext, LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

export type OpenNoteTarget = (target: ElectronRecentNote) => void;

/** What a link in `document` is resolved against; null for a draft that has no identity yet. */
export function getNoteLinkSource(document: DocumentSummary | undefined): NoteLinkSource | null {
  if (!document?.id) return null;
  if (document.teamPath === LOCAL_VAULT_TEAM_PATH) {
    const local = getLocalImageContext(document);
    return local ? { source: 'local', vaultId: local.vaultId, noteId: document.id } : null;
  }
  return { source: 'hackmd', teamPath: document.teamPath, noteId: document.id };
}

export function toRecentNote(target: NoteLinkTarget): ElectronRecentNote {
  return target.kind === 'local'
    ? { vaultId: target.vaultId, noteId: target.noteId, teamPath: LOCAL_VAULT_TEAM_PATH, title: target.title, shortId: target.noteId, lastOpenedAtMillis: Date.now() }
    : { noteId: target.noteId, teamPath: target.teamPath, title: target.title, shortId: target.shortId, lastOpenedAtMillis: Date.now() };
}

const hasScheme = (value: string) => /^[a-z][a-z0-9+.-]*:/i.test(value);

type OpenNoteLinkInput = {
  target: string;
  kind?: 'url' | 'embed';
  /** The note the link is in, which relative links are read against. */
  document: DocumentSummary | undefined;
  openNoteTarget?: OpenNoteTarget;
  openExternal: (url: string) => void;
};

/**
 * Opens a link the way HackMD would: a note HackDesk can find opens in a tab, and anything else
 * in the browser. Local data is tried first; only a HackMD link nothing local knows costs one API
 * call. Resolves with the note opened in a tab, or null.
 */
export async function openNoteLink({ target, kind = 'url', document, openNoteTarget, openExternal }: OpenNoteLinkInput): Promise<ElectronRecentNote | null> {
  const api = getHackDeskAPI();
  const hackmd = kind === 'embed' || parseHackmdUrl(target) !== null;
  const relative = kind === 'url' && !hackmd && !hasScheme(target) && !target.startsWith('#');
  if (relative && document && document.teamPath !== LOCAL_VAULT_TEAM_PATH) {
    // In a HackMD note, a relative link means what it means on hackmd.io.
    openExternal(new URL(target, getHackmdNoteUrl(document)).toString());
    return null;
  }
  if (!openNoteTarget || (!hackmd && !relative)) {
    if (kind === 'url') openExternal(target);
    return null;
  }

  const from = getNoteLinkSource(document);
  const local = from && api?.noteIndex
    ? await api.noteIndex.resolveLink({ target, kind, from }).catch(() => null)
    : null;
  if (local) {
    const note = toRecentNote(local);
    openNoteTarget(note);
    return note;
  }

  if (hackmd && api?.hackmd.resolveNote) {
    try {
      const note = { ...await api.hackmd.resolveNote(target), lastOpenedAtMillis: Date.now() };
      openNoteTarget(note);
      return note;
    } catch {
      // Not a note this account can open; a web link still opens in the browser below.
    }
  }
  if (kind === 'url' && hackmd) openExternal(target);
  else toast.error(kind === 'embed' ? `Could not find the embedded note “${target}”.` : `No note at “${target}” in this vault.`);
  return null;
}

/** `openNoteLink` for links in `document`. */
export function useNoteLinkOpener({ document, openNoteTarget, openExternal }: Omit<OpenNoteLinkInput, 'target' | 'kind'>) {
  return useCallback(
    (target: string, kind: 'url' | 'embed' = 'url') => openNoteLink({ target, kind, document, openNoteTarget, openExternal }),
    [document, openExternal, openNoteTarget],
  );
}
