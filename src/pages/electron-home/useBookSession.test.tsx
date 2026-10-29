import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';
import type { ResolveNoteLinkInput } from '@/lib/note-index';

import { BookContents, ChapterNav } from './BookContents';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { chapterTarget, useBookSession, type BookSession } from './useBookSession';

function hackmdNote(overrides: Partial<DocumentSummary>): DocumentSummary {
  return {
    id: 'note', shortId: 'note', title: 'Note', content: '', teamPath: null, userPath: 'me', permalink: null, publishType: 'edit',
    description: '', tags: [], folderPaths: [], publishLink: '', readPermission: 'owner', writePermission: 'owner', lastChangeUser: null,
    createdAtMillis: null, updatedAtMillis: null, publishedAtMillis: null, tagsUpdatedAtMillis: null, titleUpdatedAtMillis: null,
    ...overrides,
  };
}

const BOOK = hackmdNote({
  id: 'book', shortId: 'book', title: 'Handbook', publishType: 'book', content: [
    '# Handbook',
    '- [Setup](https://hackmd.io/@me/setup)',
    '- [Tools](/tools-short)',
    '- [Docs](https://example.com/docs) [target=_blank]',
  ].join('\n'),
});
const SETUP = hackmdNote({ id: 'setup-id', shortId: 'setup', title: 'Setup' });
const TOOLS = hackmdNote({ id: 'tools-id', shortId: 'tools-short', title: 'Tools' });

function installApi() {
  // The index knows Setup; Tools is found only by asking HackMD.
  const resolveLink = vi.fn(async ({ target }: ResolveNoteLinkInput) => (
    target === 'https://hackmd.io/@me/setup' ? { kind: 'hackmd' as const, noteId: 'setup-id', teamPath: null, title: 'Setup', shortId: 'setup', snippet: null } : null
  ));
  const resolveNote = vi.fn(async () => ({ noteId: 'tools-id', teamPath: null, title: 'Tools', shortId: 'tools-short' }));
  window.hackdeskAPI = { getRuntimeEnvironment: () => 'electron', noteIndex: { resolveLink }, hackmd: { resolveNote } } as unknown as typeof window.hackdeskAPI;
  return { resolveLink, resolveNote };
}

/** Lets the chapter lookups an opened book starts settle inside `act`. */
const settle = () => act(async () => {});

async function setup(document: DocumentSummary | undefined = BOOK) {
  const openNoteTarget = vi.fn();
  const openExternal = vi.fn();
  const hook = renderHook(({ current }) => useBookSession({ document: current, openNoteTarget, openExternal }), { initialProps: { current: document } });
  await settle();
  return { ...hook, openNoteTarget, openExternal };
}

afterEach(() => {
  delete window.hackdeskAPI;
});

describe('useBookSession', () => {
  it('opens a HackMD book by itself and matches chapters from local data', async () => {
    const { resolveLink } = installApi();
    const { result } = await setup();
    expect(result.current.book?.title).toBe('Handbook');
    expect(result.current.positionOf(BOOK)).toEqual({ isBook: true, chapterIndex: null });
    // Links relative to hackmd.io are read as hackmd.io addresses; new-tab links are not looked up.
    expect(resolveLink.mock.calls.map(([input]) => input.target)).toEqual(['https://hackmd.io/@me/setup', 'https://hackmd.io/tools-short']);
    await waitFor(() => expect(result.current.positionOf(SETUP)).toEqual({ isBook: false, chapterIndex: 0 }));
    expect(result.current.positionOf(TOOLS)).toBeNull();
  });

  it('learns a chapter when opening it asks HackMD, and sends new-tab links to the browser', async () => {
    const { resolveNote } = installApi();
    const { result, openNoteTarget, openExternal } = await setup();
    await act(async () => result.current.openChapter(1));
    await waitFor(() => expect(openNoteTarget).toHaveBeenCalledWith(expect.objectContaining({ noteId: 'tools-id' })));
    expect(resolveNote).toHaveBeenCalledOnce();
    expect(result.current.positionOf(TOOLS)).toEqual({ isBook: false, chapterIndex: 1 });

    act(() => result.current.openChapter(2));
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('stays closed while shown, and opens any note as a book on request', async () => {
    installApi();
    const { result, rerender } = await setup();
    act(() => result.current.close());
    expect(result.current.book).toBeNull();
    rerender({ current: { ...BOOK } });
    expect(result.current.book).toBeNull();

    const notes = hackmdNote({ id: 'list', content: '- [Setup](https://hackmd.io/@me/setup)' });
    act(() => result.current.open(notes));
    await settle();
    expect(result.current.book?.contents.chapters).toHaveLength(1);
  });

  it('marks the chapter last opened when a book lists the same note twice', async () => {
    installApi();
    const twice = hackmdNote({
      id: 'twice', publishType: 'book', content: '- [Setup](https://hackmd.io/@me/setup)\n- [Setup again](https://hackmd.io/@me/setup)',
    });
    const { result, rerender } = await setup(twice);
    expect(result.current.positionOf(SETUP)).toEqual({ isBook: false, chapterIndex: 0 });
    await act(async () => result.current.openChapter(1));
    await settle();
    expect(result.current.positionOf(SETUP)).toEqual({ isBook: false, chapterIndex: 1 });

    // Saving the book keeps the mark on the same repeat, even with a chapter added before it.
    rerender({ current: { ...twice, content: `- [Intro](https://example.com/intro) [target=_blank]\n${twice.content}` } });
    await settle();
    expect(result.current.positionOf(SETUP)).toEqual({ isBook: false, chapterIndex: 2 });
  });

  it('reads vault book links as vault paths', () => {
    const vaultBook = hackmdNote({ id: 'index.md', teamPath: LOCAL_VAULT_TEAM_PATH });
    expect(chapterTarget(vaultBook, './a.md')).toBe('./a.md');
    expect(chapterTarget(BOOK, '/tools-short')).toBe('https://hackmd.io/tools-short');
  });
});

describe('BookContents', () => {
  function session(overrides: Partial<BookSession> = {}): BookSession & { book: NonNullable<BookSession['book']> } {
    return {
      book: { title: 'Handbook', contents: { nodes: [], chapters: [] } },
      open: vi.fn(),
      close: vi.fn(),
      contentsHidden: false,
      toggleContents: vi.fn(),
      openChapter: vi.fn(),
      positionOf: vi.fn(),
      ...overrides,
    } as BookSession & { book: NonNullable<BookSession['book']> };
  }

  it('lists chapters, marks the current one, and moves with the arrow keys', async () => {
    installApi();
    const { result } = await setup();
    const open = { ...result.current, book: result.current.book!, openChapter: vi.fn() };
    render(<BookContents session={open} position={{ isBook: false, chapterIndex: 0 }} />);

    const contents = screen.getByRole('navigation', { name: 'Book contents' });
    expect(screen.getByRole('button', { name: 'Setup' }).getAttribute('aria-current')).toBe('page');
    screen.getByRole('button', { name: 'Setup' }).focus();
    fireEvent.keyDown(contents.querySelector('.overflow-auto')!, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Tools');
    fireEvent.click(screen.getByRole('button', { name: /Docs/ }));
    expect(open.openChapter).toHaveBeenCalledWith(2);

  });

  it('offers the next chapter from the book, and both neighbours from a chapter', async () => {
    installApi();
    const { result } = await setup();
    const open = { ...result.current, book: result.current.book!, openChapter: vi.fn() };
    const { rerender } = render(<ChapterNav session={open} position={{ isBook: true, chapterIndex: null }} />);
    expect(screen.queryByRole('button', { name: /Previous chapter/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter: Setup' }));
    expect(open.openChapter).toHaveBeenCalledWith(0);

    rerender(<ChapterNav session={open} position={{ isBook: false, chapterIndex: 1 }} />);
    expect(screen.getByRole('button', { name: 'Previous chapter: Setup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next chapter: Docs' })).toBeTruthy();
  });

  it('hides the contents until toggled back, and shows them again for a reopened book', async () => {
    installApi();
    const { result } = await setup();
    expect(result.current.contentsHidden).toBe(false);

    act(() => result.current.toggleContents());
    expect(result.current.contentsHidden).toBe(true);
    act(() => result.current.toggleContents());
    expect(result.current.contentsHidden).toBe(false);

    act(() => result.current.toggleContents());
    act(() => result.current.close());
    expect(result.current.contentsHidden).toBe(false);
    act(() => result.current.open(BOOK));
    expect(result.current.contentsHidden).toBe(false);
  });

  it('explains an empty book', () => {
    render(<BookContents session={session()} position={{ isBook: true, chapterIndex: null }} />);
    expect(screen.getByText('Add bulleted links to notes to make chapters.')).toBeTruthy();
  });
});
