import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { parseBook, type Book } from '@/lib/book';
import { getHackDeskAPI, type DocumentSummary } from '@/lib/electron-api';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import { getHackmdNoteUrl } from '@/lib/electron-note-links';

import { getLocalImageContext, LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { getNoteLinkSource, openNoteLink, toRecentNote, type OpenNoteTarget } from './useNoteLinkOpener';

/** Where a document sits in the open book: the book itself, or one of its chapters. */
export type BookPosition = { isBook: boolean; chapterIndex: number | null };

export type BookSession = {
  book: { title: string; contents: Book } | null;
  open: (document: DocumentSummary) => void;
  close: () => void;
  openChapter: (index: number) => void;
  positionOf: (document: DocumentSummary | undefined) => BookPosition | null;
};

type OpenBook = {
  document: DocumentSummary;
  contents: Book;
  /** The note each chapter opens, once known: from local data, or from opening it. */
  chapterNotes: (string | null)[];
  /** The chapter last opened, which wins when a book lists the same note twice. */
  lastChapter: number | null;
};

/** Identifies a note across workspaces. */
function noteKey(note: { noteId: string; teamPath: string | null; vaultId?: string }) {
  return note.teamPath === LOCAL_VAULT_TEAM_PATH ? `local:${note.vaultId}:${note.noteId}` : `hackmd:${note.teamPath ?? ''}:${note.noteId}`;
}

function documentKey(document: DocumentSummary) {
  return noteKey({ noteId: document.id, teamPath: document.teamPath, vaultId: getLocalImageContext(document)?.vaultId });
}

const recentNoteKey = (note: ElectronRecentNote) => noteKey(note);

/** A chapter link as a full address: HackMD books use links relative to hackmd.io, vault books relative paths. */
export function chapterTarget(book: DocumentSummary, target: string) {
  if (book.teamPath === LOCAL_VAULT_TEAM_PATH || /^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  return new URL(target, getHackmdNoteUrl(book)).toString();
}

/**
 * The book being read: its contents, and which open note is which chapter. HackMD books open by
 * themselves; any note can be opened as one. Chapters are matched from local data; opening a
 * chapter may ask HackMD once, as any link does.
 */
export function useBookSession({ document, openNoteTarget, openExternal }: {
  /** The active document, which opens as a book when HackMD publishes it as one. */
  document: DocumentSummary | undefined;
  openNoteTarget: OpenNoteTarget;
  openExternal: (url: string) => void;
}): BookSession {
  const [state, setState] = useState<OpenBook | null>(null);
  // HackMD books open when the reader turns to them, so a closed book stays closed while it is shown.
  const shown = useRef<string | null>(null);

  const open = useCallback((book: DocumentSummary) => {
    const contents = parseBook(book.content);
    const key = documentKey(book);
    setState(current => ({
      document: book,
      contents,
      // Keep what is known about chapters whose links did not change.
      chapterNotes: contents.chapters.map((chapter) => {
        if (!current || documentKey(current.document) !== key) return null;
        const same = current.contents.chapters.findIndex(known => known.target === chapter.target);
        return same >= 0 ? current.chapterNotes[same] ?? null : null;
      }),
      lastChapter: null,
    }));

    const api = getHackDeskAPI();
    const from = getNoteLinkSource(book);
    if (!api?.noteIndex || !from) return;
    for (const chapter of contents.chapters) {
      if (chapter.newTab) continue;
      void api.noteIndex.resolveLink({ target: chapterTarget(book, chapter.target), kind: 'url', from })
        .then((found) => {
          if (!found) return;
          setState(current => (current && documentKey(current.document) === key && current.contents === contents
            ? { ...current, chapterNotes: current.chapterNotes.map((note, index) => (index === chapter.index ? recentNoteKey(toRecentNote(found)) : note)) }
            : current));
        })
        .catch(() => undefined);
    }
  }, []);

  const close = useCallback(() => setState(null), []);

  const openChapter = useCallback((index: number) => {
    if (!state) return;
    const { document: book, contents } = state;
    const chapter = contents.chapters[index];
    if (!chapter) return;
    const target = chapterTarget(book, chapter.target);
    if (chapter.newTab) {
      openExternal(target);
      return;
    }
    void openNoteLink({ target, document: book, openNoteTarget, openExternal }).then((note) => {
      if (!note) return;
      setState(current => (current?.contents === contents
        ? { ...current, lastChapter: index, chapterNotes: current.chapterNotes.map((known, at) => (at === index ? recentNoteKey(note) : known)) }
        : current));
    });
  }, [openExternal, openNoteTarget, state]);

  const positionOf = useCallback((current: DocumentSummary | undefined): BookPosition | null => {
    if (!state || !current) return null;
    const key = documentKey(current);
    if (key === documentKey(state.document)) return { isBook: true, chapterIndex: null };
    const chapterIndex = state.lastChapter !== null && state.chapterNotes[state.lastChapter] === key
      ? state.lastChapter
      : state.chapterNotes.indexOf(key);
    return chapterIndex >= 0 ? { isBook: false, chapterIndex } : null;
  }, [state]);

  // The open book follows saved edits to it, and a HackMD book opens when the reader turns to it.
  useEffect(() => {
    if (!document) return;
    const key = documentKey(document);
    const isOpenBook = state !== null && documentKey(state.document) === key;
    if (isOpenBook && state.document.content !== document.content) open(document);
    if (shown.current === key) return;
    shown.current = key;
    if (!isOpenBook && document.publishType === 'book') open(document);
  }, [document, open, state]);

  return useMemo(() => ({
    book: state ? { title: state.document.title || 'Untitled book', contents: state.contents } : null,
    open,
    close,
    openChapter,
    positionOf,
  }), [close, open, openChapter, positionOf, state]);
}

export const BookSessionContext = createContext<BookSession | null>(null);

export const useBookSessionContext = () => useContext(BookSessionContext);
