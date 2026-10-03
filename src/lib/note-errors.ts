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
