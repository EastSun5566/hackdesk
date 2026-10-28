import type { DatabaseSync } from 'node:sqlite';

import { splitFrontMatter } from '../../../../src/lib/front-matter';
import type { NoteSource } from './note-store';

const MAX_TERMS = 32;
const MAX_NOTES = 8;
const CHUNK_LENGTH = 800;
const PASSAGES_PER_NOTE = 2;
const MAX_NOTE_TEXT = 2_000;
const MAX_TOTAL_TEXT = 16_000;
// The trigram index matches text of three characters or more.
const MIN_TERM_LENGTH = 3;

const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'how',
  'did', 'does', 'that', 'this', 'with', 'from', 'about', 'have', 'has', 'can', 'could', 'should',
  'would', 'will', 'there', 'their', 'they', 'you', 'your', 'our', 'any', 'all', 'into', 'than', 'then',
]);

export type StoredPassage = { noteId: string; title: string; meta: string | null; text: string };

/**
 * The words of a question worth searching for. Chinese and Japanese have no spaces, so their text
 * becomes overlapping three-character pieces, which is what the trigram index matches.
 */
export function questionTerms(question: string): string[] {
  const text = question.toLowerCase();
  const terms = new Set<string>();
  for (const [run] of text.matchAll(CJK_RUN)) {
    const characters = [...run];
    for (let index = 0; index + MIN_TERM_LENGTH <= characters.length; index += 1) {
      terms.add(characters.slice(index, index + MIN_TERM_LENGTH).join(''));
    }
  }
  for (const word of text.replace(CJK_RUN, ' ').split(/[^\p{L}\p{N}_]+/u)) {
    if ([...word].length >= MIN_TERM_LENGTH && !STOP_WORDS.has(word)) terms.add(word);
  }
  return [...terms].slice(0, MAX_TERMS);
}

/**
 * The notes of a workspace that best answer a question, each with its most relevant passages.
 * Notes matching more, and rarer, words come first; a match in the title counts double.
 */
export function findPassages(db: DatabaseSync, { question, source, workspace }: {
  question: string;
  source: NoteSource;
  workspace: string;
}): { passages: StoredPassage[]; indexedCount: number } {
  const indexedCount = (db.prepare('select count(*) as count from notes where source = ? and workspace = ?')
    .get(source, workspace) as { count: number }).count;
  const terms = questionTerms(question);
  if (!terms.length) return { passages: [], indexedCount };

  const rows = db.prepare(`
    select notes.note_id as noteId, notes.title as title, notes.meta as meta, notes.content as content
    from notes_fts join notes on notes.rowid = notes_fts.rowid
    where notes_fts match ? and notes.source = ? and notes.workspace = ?
    order by bm25(notes_fts, 2.0, 1.0) limit ?
  `).all(terms.map(term => `"${term.replaceAll('"', '""')}"`).join(' OR '), source, workspace, MAX_NOTES) as
    (Omit<StoredPassage, 'text'> & { content: string })[];

  const passages: StoredPassage[] = [];
  let total = 0;
  for (const { content, ...row } of rows) {
    const text = bestPassages(splitFrontMatter(content).body, terms).slice(0, Math.min(MAX_NOTE_TEXT, MAX_TOTAL_TEXT - total));
    // An empty note adds nothing; once the budget is spent, every later note is empty too.
    if (!text) continue;
    passages.push({ ...row, text });
    total += text.length;
  }
  return { passages, indexedCount };
}

/** The note's paragraphs that contain the most question words, in reading order. */
function bestPassages(body: string, terms: string[]) {
  const chunks = body.split(/\n[ \t]*\n/).map(block => block.trim()).filter(Boolean)
    .flatMap(block => Array.from({ length: Math.ceil(block.length / CHUNK_LENGTH) }, (_, index) => block.slice(index * CHUNK_LENGTH, (index + 1) * CHUNK_LENGTH)));
  const scored = chunks.map((text, index) => {
    const lower = text.toLowerCase();
    return { text, index, score: terms.filter(term => lower.includes(term)).length };
  });
  const best = scored.filter(chunk => chunk.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, PASSAGES_PER_NOTE)
    .sort((left, right) => left.index - right.index);
  // A note found by its title alone is summed up by its opening.
  return (best.length ? best : scored.slice(0, 1)).map(chunk => chunk.text).join('\n\n…\n\n');
}
