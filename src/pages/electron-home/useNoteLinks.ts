import { useCallback, useMemo, useRef } from 'react';

import type { NoteEmbedCard } from '@/components/hackmd-live-preview/note-embeds/extension';
import type { MarkdownEditorNoteLinks, NoteLinkCandidate } from '@/components/markdown-editor-types';
import { getHackDeskAPI, type DocumentSummary, type NoteSummary } from '@/lib/electron-api';
import { getHackmdNoteUrl } from '@/lib/electron-note-links';
import type { NoteLinkSource } from '@/lib/note-index';
import { hackmdEmbedRef, relativeVaultLink, type EmbedLine } from '@/lib/note-links';

import { getLocalImageContext, LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { getNoteLinkSource } from './useNoteLinkOpener';

/** The other notes in this workspace, written as links from `document`. */
export function getNoteLinkCandidates(document: DocumentSummary | undefined, notes: NoteSummary[]): NoteLinkCandidate[] {
  if (!document) return [];
  if (document.teamPath === LOCAL_VAULT_TEAM_PATH) {
    const fromPath = getLocalImageContext(document)?.relativePath;
    if (!fromPath) return [];
    return notes
      .filter(note => note.teamPath === LOCAL_VAULT_TEAM_PATH && note.id !== document.id)
      // A vault note's short ID is its path inside the vault.
      .map(note => ({ title: note.title, detail: note.shortId, link: relativeVaultLink(fromPath, note.shortId), embedRef: null }));
  }
  return notes
    .filter(note => note.teamPath !== LOCAL_VAULT_TEAM_PATH && note.id !== document.id)
    .map((note) => {
      const embedRef = hackmdEmbedRef(note);
      return { title: note.title, detail: embedRef, link: getHackmdNoteUrl(note), embedRef };
    });
}

const embedKey = (embed: EmbedLine) => (embed.kind === 'embed' ? `embed:${embed.raw}` : `url:${embed.url}`);

/**
 * Note links for one open note: what can be linked from it, what its embed cards show, and how
 * they open. Everything here reads local data; opening is the only step that may call HackMD.
 */
export function useNoteLinks({ document, notes, openLink }: {
  document: DocumentSummary | undefined;
  notes: NoteSummary[];
  openLink: (target: string, kind: 'url' | 'embed') => void;
}): MarkdownEditorNoteLinks | null {
  const api = getHackDeskAPI();
  const from = getNoteLinkSource(document);
  const fromKey = from ? JSON.stringify(from) : null;
  const latest = useRef({ document, notes });
  latest.current = { document, notes };
  // Cards for the same embed ask once per note, not on every redraw.
  const cards = useRef<{ fromKey: string | null; entries: Map<string, Promise<NoteEmbedCard | null>> }>({ fromKey, entries: new Map() });
  if (cards.current.fromKey !== fromKey) cards.current = { fromKey, entries: new Map() };

  const resolve = useCallback((target: string, kind: 'url' | 'embed') => {
    if (!api?.noteIndex || !fromKey) return Promise.resolve(null);
    return api.noteIndex.resolveLink({ target, kind, from: JSON.parse(fromKey) as NoteLinkSource }).catch(() => null);
  }, [api, fromKey]);

  const describe = useCallback((embed: EmbedLine) => {
    const key = embedKey(embed);
    let card = cards.current.entries.get(key);
    if (!card) {
      card = (embed.kind === 'embed' ? resolve(embed.raw, 'embed') : resolve(embed.url, 'url'))
        .then(found => (found ? { title: found.title, snippet: found.snippet } : null));
      cards.current.entries.set(key, card);
    }
    return card;
  }, [resolve]);

  return useMemo(() => (api?.noteIndex ? {
    candidates: () => getNoteLinkCandidates(latest.current.document, latest.current.notes),
    describe,
    openEmbed: embed => (embed.kind === 'embed' ? openLink(embed.raw, 'embed') : openLink(embed.url, 'url')),
    titleForUrl: async url => (await resolve(url, 'url'))?.title ?? null,
  } : null), [api, describe, openLink, resolve]);
}
