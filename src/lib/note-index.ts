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

export type NoteIndexStatus = { hackmdNotes: number; hackmdBytes: number; localNotes: number };

export const MAX_NOTE_SEARCH_QUERY_LENGTH = 200;
