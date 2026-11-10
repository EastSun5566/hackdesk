import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { NoteSummary } from '@/lib/electron-api';

import { NoteIcon, rememberNoteSlideType, useNoteKind } from './note-kind';

function note(id: string, publishType: NoteSummary['publishType'], content: string | null = null) {
  return { id, publishType, content };
}

describe('useNoteKind', () => {
  it('follows how HackMD publishes the note', () => {
    expect(renderHook(() => useNoteKind(note('a', 'book'))).result.current).toBe('book');
    expect(renderHook(() => useNoteKind(note('b', 'slide'))).result.current).toBe('slide');
    expect(renderHook(() => useNoteKind(note('c', 'edit'))).result.current).toBe('note');
    expect(renderHook(() => useNoteKind(null)).result.current).toBe('note');
  });

  it('reads type: slide from the front matter when the list has the text', () => {
    expect(renderHook(() => useNoteKind(note('d', 'edit', '---\ntype: slide\n---\n# Deck'))).result.current).toBe('slide');
    expect(renderHook(() => useNoteKind(note('e', 'edit', '# Not a deck\n\ntype: slide'))).result.current).toBe('note');
  });

  it('updates a listed note once its open text says it is a deck, and back', () => {
    const { result } = renderHook(() => useNoteKind(note('local-1', 'view')));
    expect(result.current).toBe('note');
    act(() => rememberNoteSlideType('local-1', true));
    expect(result.current).toBe('slide');
    act(() => rememberNoteSlideType('local-1', false));
    expect(result.current).toBe('note');
  });

  it('keeps a published book a book whatever its text says', () => {
    rememberNoteSlideType('book-1', true);
    expect(renderHook(() => useNoteKind(note('book-1', 'book'))).result.current).toBe('book');
  });
});

describe('NoteIcon', () => {
  it('marks a note known only by ID once its open text is a deck', () => {
    const { container } = render(<NoteIcon noteId="tab-only" />);
    expect(container.querySelector('[data-note-kind]')).toHaveAttribute('data-note-kind', 'note');
    act(() => rememberNoteSlideType('tab-only', true));
    expect(container.querySelector('[data-note-kind]')).toHaveAttribute('data-note-kind', 'slide');
  });
});
