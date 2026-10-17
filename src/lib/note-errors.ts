// Errors that confirm a note no longer exists, as opposed to a temporary read
// failure. IPC only carries messages, so both sides share these strings.
export const LOCAL_NOTE_NOT_FOUND_MESSAGE = 'Local note was not found.';
export const HACKMD_NOTE_NOT_FOUND_MESSAGE = 'This HackMD note was not found. It may have been deleted, or you may no longer have access.';

export function isNoteNotFoundError(message: string | null | undefined) {
  return !!message && (message.includes(LOCAL_NOTE_NOT_FOUND_MESSAGE) || message.includes(HACKMD_NOTE_NOT_FOUND_MESSAGE));
}

/** Electron prefixes errors thrown across IPC; drop that prefix for display. */
export function stripIpcErrorPrefix(message: string) {
  return message.replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/, '');
}

// HackMD's API has no conditional write, so a save compares the latest note
// with the draft's base just before writing. A change made between that read
// and the write can still be overwritten.
export const HACKMD_NOTE_CHANGED_MESSAGE = 'This note changed on HackMD after you started editing, so your draft was not saved.';

// HackMD answers 403 or 404 when a note's versions can't be read, for example
// a team note the API does not expose versions for.
export const HACKMD_NOTE_VERSIONS_UNAVAILABLE_MESSAGE = "Version history isn't available for this note.";

// HackMD answers 422 when editing a version that has no name yet.
export const HACKMD_NOTE_VERSION_NOT_NAMED_MESSAGE = 'This version has no name yet.';

export function isNoteVersionsUnavailableError(message: string | null | undefined) {
  return !!message && message.includes(HACKMD_NOTE_VERSIONS_UNAVAILABLE_MESSAGE);
}

// HackMD answers 403 or 404 when a note's comments can't be read, for example
// when commenting is turned off for the note.
export const HACKMD_NOTE_COMMENTS_UNAVAILABLE_MESSAGE = "Comments aren't available for this note.";

export function isNoteCommentsUnavailableError(message: string | null | undefined) {
  return !!message && message.includes(HACKMD_NOTE_COMMENTS_UNAVAILABLE_MESSAGE);
}

export function isRemoteNoteChangedError(message: string | null | undefined) {
  return !!message && message.includes(HACKMD_NOTE_CHANGED_MESSAGE);
}
