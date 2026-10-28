/** Marks the matched text in a search snippet; the UI turns these into highlights. */
export const NOTE_MATCH_START = '\u0001';
export const NOTE_MATCH_END = '\u0002';

/** Which notes a search covers: one Local Vault, or one HackMD workspace. */
export type NoteSearchScope =
  | { type: 'local'; vaultId: string }
  | { type: 'hackmd'; teamPath: string | null };

export type NoteSearchInput = { query: string; scope: NoteSearchScope; limit?: number };

export type NoteTextMatch = { noteId: string; title: string; snippet: string };

export type NoteSearchResponse = {
  matches: NoteTextMatch[];
  /** How many notes of the workspace have their text indexed: every vault note, or the HackMD notes opened before. */
  indexedCount: number;
};

export const MAX_NOTE_QUESTION_LENGTH = 1_000;

export type NotePassagesInput = { question: string; scope: NoteSearchScope };

/** A note that may answer a question, with the parts of its text most related to it. */
export type NotePassage = { note: NoteLinkTarget; text: string };

export type NotePassagesResponse = {
  passages: NotePassage[];
  /** How many notes of the workspace were searched. */
  indexedCount: number;
};

export type NoteIndexStatus = { hackmdNotes: number; hackmdBytes: number; localNotes: number };

export const MAX_NOTE_SEARCH_QUERY_LENGTH = 200;

/** The note a link is in, so relative vault links can be resolved from its folder. */
export type NoteLinkSource =
  | { source: 'local'; vaultId: string; noteId: string }
  | { source: 'hackmd'; teamPath: string | null; noteId: string };

export type ResolveNoteLinkInput = {
  /** A URL, a relative vault path, or a `{%hackmd %}` reference such as `@owner/permalink`. */
  target: string;
  kind: 'url' | 'embed';
  from: NoteLinkSource;
};

export type NoteLinkTarget =
  | { kind: 'local'; vaultId: string; noteId: string; title: string; snippet: string | null }
  | { kind: 'hackmd'; noteId: string; teamPath: string | null; title: string; shortId: string; snippet: string | null };

export type NoteBacklinksInput = {
  target:
    | { source: 'local'; vaultId: string; noteId: string }
    | { source: 'hackmd'; id: string; shortId: string; permalink: string | null; userPath: string | null; teamPath: string | null };
};

export type NoteBacklinksResponse = {
  notes: NoteLinkTarget[];
  /** How many HackMD notes were searched for links: only those opened before. */
  hackmdIndexed: number;
};
