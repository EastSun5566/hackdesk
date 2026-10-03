import { describe, expect, it } from 'vitest';

import { HACKMD_NOTE_NOT_FOUND_MESSAGE, isNoteNotFoundError, LOCAL_NOTE_NOT_FOUND_MESSAGE, stripIpcErrorPrefix } from './note-errors';

describe('note errors', () => {
  it('recognizes only confirmed missing notes', () => {
    expect(isNoteNotFoundError(LOCAL_NOTE_NOT_FOUND_MESSAGE)).toBe(true);
    expect(isNoteNotFoundError(HACKMD_NOTE_NOT_FOUND_MESSAGE)).toBe(true);
    expect(isNoteNotFoundError('HackMD is having trouble right now. Please try again in a moment.')).toBe(false);
    expect(isNoteNotFoundError('EACCES: permission denied')).toBe(false);
    expect(isNoteNotFoundError(null)).toBe(false);
  });

  it('removes the Electron IPC prefix but keeps the original message', () => {
    expect(stripIpcErrorPrefix(`Error invoking remote method 'local-vault:read-note': Error: ${LOCAL_NOTE_NOT_FOUND_MESSAGE}`)).toBe(LOCAL_NOTE_NOT_FOUND_MESSAGE);
    expect(stripIpcErrorPrefix("Error invoking remote method 'x': EACCES: permission denied")).toBe('EACCES: permission denied');
    expect(stripIpcErrorPrefix('Plain message')).toBe('Plain message');
  });
});
