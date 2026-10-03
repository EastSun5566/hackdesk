import type { NoteSummary } from './electron-api';
import { trySetStorageItem } from './storage';

const LOCAL_TEAM_PATH = '__hackdesk_local_vault__';

export type ElectronRecentNote = {
  vaultId?: string;
  noteId: string;
  teamPath: string | null;
  title: string;
  shortId: string;
  lastOpenedAtMillis: number;
};

export const ELECTRON_RECENT_NOTES_STORAGE_KEY = 'hackdesk_electron_recent_notes';
export const ELECTRON_RECENT_NOTES_LIMIT = 12;

function getRecentNoteKey(noteId: string, teamPath: string | null, vaultId?: string) {
  return `${teamPath ?? 'personal'}:${teamPath === LOCAL_TEAM_PATH ? vaultId ?? 'unknown' : ''}:${noteId}`;
}

function normalizeTitle(title: unknown) {
  return typeof title === 'string' && title.trim() ? title.trim() : 'Untitled';
}

function normalizeShortId(shortId: unknown, noteId: string) {
  return typeof shortId === 'string' && shortId.trim() ? shortId.trim() : noteId;
}

export function normalizeRecentNotes(value: unknown): ElectronRecentNote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const notes: ElectronRecentNote[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const candidate = item as Partial<ElectronRecentNote>;
    if (typeof candidate.noteId !== 'string' || !candidate.noteId.trim()) {
      continue;
    }

    const noteId = candidate.noteId.trim();
    const teamPath = typeof candidate.teamPath === 'string' && candidate.teamPath.trim()
      ? candidate.teamPath.trim()
      : null;
    const vaultId = teamPath === LOCAL_TEAM_PATH && typeof candidate.vaultId === 'string' && candidate.vaultId.trim()
      ? candidate.vaultId.trim() : undefined;
    const key = getRecentNoteKey(noteId, teamPath, vaultId);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    notes.push({
      noteId,
      ...(vaultId ? { vaultId } : {}),
      teamPath,
      title: normalizeTitle(candidate.title),
      shortId: normalizeShortId(candidate.shortId, noteId),
      lastOpenedAtMillis: typeof candidate.lastOpenedAtMillis === 'number' && Number.isFinite(candidate.lastOpenedAtMillis)
        ? candidate.lastOpenedAtMillis
        : 0,
    });
  }

  const counts = new Map<string, number>();
  return notes
    .sort((left, right) => right.lastOpenedAtMillis - left.lastOpenedAtMillis)
    .filter((note) => {
      const bucket = note.teamPath === LOCAL_TEAM_PATH ? `local:${note.vaultId ?? 'unknown'}` : 'remote';
      const count = counts.get(bucket) ?? 0;
      counts.set(bucket, count + 1);
      return count < ELECTRON_RECENT_NOTES_LIMIT;
    });
}

export function readRecentNotes(storage: Storage) {
  try {
    return normalizeRecentNotes(JSON.parse(storage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function writeRecentNotes(storage: Storage, notes: ElectronRecentNote[]) {
  return trySetStorageItem(storage, ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify(normalizeRecentNotes(notes)));
}

export function upsertRecentNote(notes: ElectronRecentNote[], note: Pick<NoteSummary, 'id' | 'teamPath' | 'title' | 'shortId'> & { localVaultId?: string }, now = Date.now()) {
  const teamPath = note.teamPath ?? null;
  const vaultId = teamPath === LOCAL_TEAM_PATH ? note.localVaultId : undefined;
  const key = getRecentNoteKey(note.id, teamPath, vaultId);
  return normalizeRecentNotes([
    {
      noteId: note.id,
      ...(vaultId ? { vaultId } : {}),
      teamPath,
      title: normalizeTitle(note.title),
      shortId: normalizeShortId(note.shortId, note.id),
      lastOpenedAtMillis: now,
    },
    ...notes.filter((candidate) => getRecentNoteKey(candidate.noteId, candidate.teamPath, candidate.vaultId) !== key),
  ]);
}

export function removeRecentNote(notes: ElectronRecentNote[], noteId: string, teamPath: string | null, vaultId?: string) {
  const key = getRecentNoteKey(noteId, teamPath, vaultId);
  return notes.filter((candidate) => getRecentNoteKey(candidate.noteId, candidate.teamPath, candidate.vaultId) !== key);
}

export function recentNoteMatches(note: Pick<NoteSummary, 'id' | 'teamPath'>, recent: ElectronRecentNote) {
  return note.id === recent.noteId && (note.teamPath ?? null) === recent.teamPath;
}
