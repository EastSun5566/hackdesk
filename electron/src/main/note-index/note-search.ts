import type { DatabaseSync } from 'node:sqlite';

import { NOTE_MATCH_END as MATCH_END, NOTE_MATCH_START as MATCH_START } from '../../../../src/lib/note-index';
import type { NoteSource } from './note-store';

export { MATCH_END, MATCH_START };
/** The trigram index needs three characters; shorter queries scan instead. */
const MIN_INDEXED_LENGTH = 3;
const SNIPPET_RADIUS = 40;

export type NoteSearchInput = {
  query: string;
  source: NoteSource;
  workspace: string;
  limit?: number;
};

export type NoteSearchMatch = { noteId: string; title: string; snippet: string };

export type NoteSearchResult = {
  matches: NoteSearchMatch[];
  /** How many notes of this workspace the index holds, so the UI can say what was searched. */
  indexedCount: number;
};

/** Each word becomes a quoted phrase, so punctuation and operators in the query match literally. */
function toFtsQuery(words: string[]) {
  return words.map(word => `"${word.replaceAll('"', '""')}"`).join(' AND ');
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`);
}

function flatten(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

/** A window of `text` around the first occurrence of `needle`, with the match marked. */
export function makeSnippet(text: string, needle: string) {
  const flat = flatten(text);
  const index = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return flat.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(flat.length, index + needle.length + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${flat.slice(start, index)}${MATCH_START}${flat.slice(index, index + needle.length)}${MATCH_END}${flat.slice(index + needle.length, end)}${end < flat.length ? '…' : ''}`;
}

export function searchNoteIndex(db: DatabaseSync, { query, source, workspace, limit = 50 }: NoteSearchInput): NoteSearchResult {
  const indexedCount = (db.prepare('select count(*) as count from notes where source = ? and workspace = ?')
    .get(source, workspace) as { count: number }).count;
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { matches: [], indexedCount };

  if (words.every(word => [...word].length >= MIN_INDEXED_LENGTH)) {
    const rows = db.prepare(`
      select notes.note_id as noteId, notes.title as title,
        snippet(notes_fts, 1, ?, ?, '…', 12) as snippet
      from notes_fts join notes on notes.rowid = notes_fts.rowid
      where notes_fts match ? and notes.source = ? and notes.workspace = ?
      order by rank limit ?
    `).all(MATCH_START, MATCH_END, toFtsQuery(words), source, workspace, limit) as NoteSearchMatch[];
    return { matches: rows.map(row => ({ ...row, snippet: flatten(row.snippet) })), indexedCount };
  }

  // Short words cannot use the trigram index; a plain scan is fine at note-collection sizes.
  const conditions = words.map(() => "(title like ? escape '\\' or content like ? escape '\\')").join(' and ');
  const parameters = words.flatMap(word => [`%${escapeLike(word)}%`, `%${escapeLike(word)}%`]);
  const rows = db.prepare(`
    select note_id as noteId, title, content from notes
    where source = ? and workspace = ? and ${conditions}
    order by cached_at desc limit ?
  `).all(source, workspace, ...parameters, limit) as { noteId: string; title: string; content: string }[];
  return {
    matches: rows.map(row => ({ noteId: row.noteId, title: row.title, snippet: makeSnippet(row.content, words[0]!) })),
    indexedCount,
  };
}
