import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { parseBook } from '@/lib/book';

import type { DocumentSummary } from '@/lib/electron-api';

import { BookContents, BookPane } from './BookContents';
import { BookSessionContext, type BookSession } from './useBookSession';

function Harness({ openChapter }: { openChapter: (index: number) => void }) {
  const [contentsHidden, setContentsHidden] = useState(false);
  const session: BookSession & { book: NonNullable<BookSession['book']> } = {
    book: { title: 'Guide', contents: parseBook('- [Intro](intro.md)\n- [Usage](usage.md)\n') },
    open: vi.fn(),
    close: vi.fn(),
    contentsHidden,
    toggleContents: () => setContentsHidden(hidden => !hidden),
    openChapter,
    positionOf: () => null,
    positionOfNote: () => null,
    openContentsPage: vi.fn(),
  };
  return <BookContents session={session} position={{ isBook: true, chapterIndex: null }} />;
}

describe('BookContents', () => {
  it('hides and shows its contents, its one button still a toolbar part while hidden', () => {
    render(<Harness openChapter={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide book contents' }));
    expect(screen.queryByRole('navigation', { name: 'Book contents' })).not.toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Book actions' })).toContainElement(screen.getByRole('button', { name: 'Show book contents' }));

    fireEvent.click(screen.getByRole('button', { name: 'Show book contents' }));
    expect(screen.getByRole('navigation', { name: 'Book contents' })).toBeInTheDocument();
  });

  it('offers to edit the table of contents from a chapter, not from the contents page itself', () => {
    const openContentsPage = vi.fn();
    const session = {
      book: { title: 'Guide', contents: parseBook('- [Intro](intro.md)\n') },
      open: vi.fn(), close: vi.fn(), contentsHidden: false, toggleContents: vi.fn(), openChapter: vi.fn(),
      openContentsPage, positionOf: () => null, positionOfNote: () => null,
    };
    const { rerender } = render(<BookContents session={session} position={{ isBook: false, chapterIndex: 0 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit table of contents' }));
    expect(openContentsPage).toHaveBeenCalledOnce();
    rerender(<BookContents session={session} position={{ isBook: true, chapterIndex: null }} />);
    expect(screen.queryByRole('button', { name: 'Edit table of contents' })).not.toBeInTheDocument();
  });

  it('opens a chapter from the contents', () => {
    const openChapter = vi.fn();
    render(<Harness openChapter={openChapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usage' }));
    expect(openChapter).toHaveBeenCalledWith(1);
  });
});

describe('BookPane', () => {
  const bookDoc = { id: 'book' } as DocumentSummary;
  const otherDoc = { id: 'other' } as DocumentSummary;
  const session = (open: boolean): BookSession => ({
    book: open ? { title: 'Guide', contents: parseBook('- [Intro](intro.md)\n') } : null,
    open: vi.fn(),
    close: vi.fn(),
    contentsHidden: false,
    toggleContents: vi.fn(),
    openChapter: vi.fn(),
    positionOf: (document) => (document?.id === 'book' ? { isBook: true, chapterIndex: null } : null),
    positionOfNote: () => null,
    openContentsPage: vi.fn(),
  });
  let mounts = 0;
  function Note() {
    useEffect(() => { mounts += 1; }, []);
    return <p>Note body</p>;
  }
  const pane = (open: boolean, document: DocumentSummary | undefined, loading: boolean) => (
    <BookSessionContext.Provider value={session(open)}>
      <BookPane document={document} loading={loading}><Note /></BookPane>
    </BookSessionContext.Provider>
  );
  const contents = () => screen.queryByRole('navigation', { name: 'Book contents' });

  it('keeps the contents beside the pane while the next note loads, and drops them for a note outside the book', () => {
    const { rerender } = render(pane(true, bookDoc, false));
    expect(contents()).toBeInTheDocument();
    rerender(pane(true, undefined, true));
    expect(contents()).toBeInTheDocument();
    rerender(pane(true, otherDoc, false));
    expect(contents()).not.toBeInTheDocument();
  });

  it('never remounts the note when a book opens or closes beside it', () => {
    mounts = 0;
    const { rerender } = render(pane(false, bookDoc, false));
    rerender(pane(true, bookDoc, false));
    expect(contents()).toBeInTheDocument();
    rerender(pane(false, bookDoc, false));
    expect(mounts).toBe(1);
  });
});
