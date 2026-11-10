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
  /** Whether the reader hid the contents beside the book; they show again when it reopens. */
  contentsHidden: boolean;
  toggleContents: () => void;
  openChapter: (index: number) => void;
  /** Turns the book's tab back to the book itself: its table of contents. */
  openContentsPage: () => void;
  /**
   * Where the note a tab shows is in the open book. Only the book's own tab reads as the book: the
   * same note opened anywhere else (the sidebar, a link) is a regular note in a regular tab.
   */
  positionOf: (document: DocumentSummary | undefined, tabId: string | null | undefined) => BookPosition | null;
  /** As positionOf, for a note known only by ID (a tab's). */
  positionOfNote: (note: { id: string; teamPath: string | null }, tabId: string | null | undefined) => BookPosition | null;
  /** The tab the book is read in, while a book is open. */
  tabId: string | null;
};

type OpenBook = {
  document: DocumentSummary;
  /** The tab the book was opened in; its chapters turn this tab. */
  tabId: string | null;
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

/** A note key without its vault: `local:<vault>:<id>` becomes `local::<id>`. */
const withoutVault = (key: string) => key.replace(/^local:[^:]*:/, 'local::');

/** The chapter in `next` with the same link as `index` in `previous`, counting repeats of that link. */
function sameOccurrence(previous: Book, index: number, next: Book) {
  const target = previous.chapters[index]?.target;
  const occurrence = previous.chapters.slice(0, index).filter(chapter => chapter.target === target).length;
  return next.chapters.filter(chapter => chapter.target === target)[occurrence]?.index ?? null;
}

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
export function useBookSession({ document, activeTabId, openNoteTarget, openExternal }: {
  /** The active document, which opens as a book when HackMD publishes it as one. */
  document: DocumentSummary | undefined;
  /** The active tab: a book opens in it. */
  activeTabId: string | null;
  openNoteTarget: OpenNoteTarget;
  openExternal: (url: string) => void;
}): BookSession {
  const [state, setState] = useState<OpenBook | null>(null);
  const activeTab = useRef(activeTabId);
  useEffect(() => {
    activeTab.current = activeTabId;
  }, [activeTabId]);
  // HackMD books open when the reader turns to them, so a closed book stays closed while it is shown.
  const shown = useRef<string | null>(null);

  /** `keepTab`: the book's text changed, so the open book refreshes in the tab it already reads in. */
  const openBook = useCallback((book: DocumentSummary, keepTab: boolean) => {
    const contents = parseBook(book.content);
    const key = documentKey(book);
    setState((current) => {
      const previous = current && documentKey(current.document) === key ? current : null;
      return {
        document: book,
        // Reopening the same book (its text changed) keeps its tab; opening it on request reads it
        // in the tab the reader asked from, even when another tab of the same book had it.
        tabId: (keepTab ? previous?.tabId : null) ?? activeTab.current,
        contents,
        // Keep what is known about chapters whose links did not change.
        chapterNotes: contents.chapters.map((chapter) => {
          const same = previous?.contents.chapters.findIndex(known => known.target === chapter.target) ?? -1;
          return same >= 0 ? previous!.chapterNotes[same] ?? null : null;
        }),
        lastChapter: previous?.lastChapter == null ? null : sameOccurrence(previous.contents, previous.lastChapter, contents),
      };
    });

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
  const open = useCallback((book: DocumentSummary) => openBook(book, false), [openBook]);

  const close = useCallback(() => setState(null), []);
  const [hiddenFor, setHiddenFor] = useState<Book | null>(null);
  const contentsHidden = state !== null && hiddenFor === state.contents;
  const toggleContents = useCallback(() => {
    setHiddenFor(hidden => (state && hidden !== state.contents ? state.contents : null));
  }, [state]);

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
    // A chapter turns the book's tab, rather than opening a tab of its own. The tab is named now:
    // finding the chapter can take a round trip, and the reader may switch tabs meanwhile.
    const inPlace = state.tabId ? { tabId: state.tabId } : true;
    const openInBookTab: OpenNoteTarget = (entry) => openNoteTarget(entry, { inPlace });
    void openNoteLink({ target, document: book, openNoteTarget: openInBookTab, openExternal }).then((note) => {
      if (!note) return;
      setState(current => (current?.contents === contents
        ? { ...current, lastChapter: index, chapterNotes: current.chapterNotes.map((known, at) => (at === index ? recentNoteKey(note) : known)) }
        : current));
    });
  }, [openExternal, openNoteTarget, state]);

  const openContentsPage = useCallback(() => {
    if (!state) return;
    const { document: book } = state;
    const vaultId = getLocalImageContext(book)?.vaultId;
    openNoteTarget(vaultId
      ? { vaultId, noteId: book.id, teamPath: LOCAL_VAULT_TEAM_PATH, title: book.title, shortId: book.id, lastOpenedAtMillis: Date.now() }
      : { noteId: book.id, teamPath: book.teamPath, title: book.title, shortId: book.shortId, lastOpenedAtMillis: Date.now() },
    { inPlace: state.tabId ? { tabId: state.tabId } : true });
  }, [openNoteTarget, state]);

  const positionOf = useCallback((current: DocumentSummary | undefined, tabId: string | null | undefined): BookPosition | null => {
    if (!state || !current || !tabId || tabId !== state.tabId) return null;
    const key = documentKey(current);
    if (key === documentKey(state.document)) return { isBook: true, chapterIndex: null };
    const chapterIndex = state.lastChapter !== null && state.chapterNotes[state.lastChapter] === key
      ? state.lastChapter
      : state.chapterNotes.indexOf(key);
    return chapterIndex >= 0 ? { isBook: false, chapterIndex } : null;
  }, [state]);

  const positionOfNote = useCallback((note: { id: string; teamPath: string | null }, tabId: string | null | undefined): BookPosition | null => {
    if (!state || !tabId || tabId !== state.tabId) return null;
    // Tabs carry no vault ID; a tab's notes all come from the open vault, so the ID and team suffice.
    const key = withoutVault(noteKey({ noteId: note.id, teamPath: note.teamPath, vaultId: '' }));
    if (key === withoutVault(documentKey(state.document))) return { isBook: true, chapterIndex: null };
    const keys = state.chapterNotes.map(known => (known ? withoutVault(known) : null));
    const chapterIndex = state.lastChapter !== null && keys[state.lastChapter] === key ? state.lastChapter : keys.indexOf(key);
    return chapterIndex >= 0 ? { isBook: false, chapterIndex } : null;
  }, [state]);

  // The open book follows saved edits to it, and a HackMD book opens when the reader turns to it.
  useEffect(() => {
    if (!document) {
      // Nothing is shown (the book's tab was the last one), so turning back to the book opens it again.
      shown.current = null;
      return;
    }
    const key = documentKey(document);
    const isOpenBook = state !== null && documentKey(state.document) === key;
    if (isOpenBook && state.document.content !== document.content) openBook(document, true);
    if (shown.current === key) return;
    shown.current = key;
    if (!isOpenBook && document.publishType === 'book') openBook(document, false);
  }, [document, openBook, state]);

  return useMemo(() => ({
    book: state ? { title: state.document.title || 'Untitled book', contents: state.contents } : null,
    open,
    close,
    contentsHidden,
    toggleContents,
    openChapter,
    openContentsPage,
    positionOf,
    positionOfNote,
    tabId: state?.tabId ?? null,
  }), [close, contentsHidden, open, openChapter, openContentsPage, positionOf, positionOfNote, state, toggleContents]);
}

export const BookSessionContext = createContext<BookSession | null>(null);

export const useBookSessionContext = () => useContext(BookSessionContext);

/** The tab a document pane shows. Book reading shows only in the book's own tab (see positionOf). */
export const PaneTabIdContext = createContext<string | null>(null);

export const usePaneTabId = () => useContext(PaneTabIdContext);
