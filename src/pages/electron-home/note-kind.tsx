import { useSyncExternalStore } from 'react';
import { BookOpen, FileText, Presentation } from 'lucide-react';

import type { NoteSummary } from '@/lib/electron-api';
import { hasSlideType } from '@/lib/slides';
import { cn } from '@/lib/utils';

/** What a note opens as: a page, a slide deck, or a book. Lists show it as the note's icon. */
export type NoteKind = 'note' | 'slide' | 'book';

type NoteKindSource = Pick<NoteSummary, 'id' | 'publishType' | 'content'>;

/**
 * Whether opened notes' front matter says `type: slide`, by note ID. Lists rarely carry a note's
 * content (local vault scans read none), so a note's own text marks it a deck once it has been
 * open. Listeners are per note, so a change re-renders that note's rows, not every row.
 */
const slideByContent = new Map<string, boolean>();
const listeners = new Map<string, Set<() => void>>();

/** Records whether an open note's text marks it a deck, so its rows and tabs show the matching icon. */
export function rememberNoteSlideType(noteId: string, slide: boolean) {
  if (slideByContent.get(noteId) === slide) return;
  slideByContent.set(noteId, slide);
  listeners.get(noteId)?.forEach(listener => listener());
}

function subscribe(noteId: string, listener: () => void) {
  let set = listeners.get(noteId);
  if (!set) listeners.set(noteId, set = new Set());
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(noteId);
  };
}

/**
 * A note's kind, as Present and book mode decide it: published as a book, or published as slides
 * or marked `type: slide` in its front matter (from the list's content, or the open note's text).
 */
export function useNoteKind(note: NoteKindSource | null | undefined): NoteKind {
  const noteId = note?.id ?? '';
  const slideFromOpenText = useSyncExternalStore(
    (listener) => (noteId ? subscribe(noteId, listener) : () => undefined),
    () => (noteId ? slideByContent.get(noteId) : undefined),
  );
  if (!note) return 'note';
  if (note.publishType === 'book') return 'book';
  if (note.publishType === 'slide') return 'slide';
  const slide = slideFromOpenText ?? (note.content ? hasSlideType(note.content) : false);
  return slide ? 'slide' : 'note';
}

/** The note's icon: a page, a slide deck or a book. Takes the size and colour classes of the icon it replaces. */
export function NoteKindIcon({ kind, className }: { kind: NoteKind; className?: string }) {
  const Icon = kind === 'slide' ? Presentation : kind === 'book' ? BookOpen : FileText;
  return <Icon aria-hidden="true" data-note-kind={kind} className={cn('shrink-0', className)} />;
}


/**
 * The icon for a note known by its summary, or only by its ID (a tab or recent note the sidebar
 * isn't listing): then only an opened note's own text can mark it a deck.
 */
export function NoteIcon({ note, noteId, className }: { note?: NoteKindSource | null; noteId?: string; className?: string }) {
  const kind = useNoteKind(note ?? (noteId ? { id: noteId, publishType: 'edit', content: null } : null));
  return <NoteKindIcon kind={kind} className={className} />;
}
