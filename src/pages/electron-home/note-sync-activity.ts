import {
  getNoteIdentityKey,
  getSavedTabNoteIdentity,
  isBlankNoteTab,
  isDraftNoteTab,
  type NoteIdentity,
  type OpenNoteTab,
} from './note-workspace';

/**
 * What each note, or each unsaved draft, is doing with the backend: saving, a save that failed,
 * deleting, uploading images. It is kept per note so one tab's work never shows on another, and
 * each request carries an id so a late response cannot overwrite newer state.
 *
 * Saved notes are keyed by identity, so every tab showing a note shows its state; drafts have no
 * identity yet and are keyed by their tab.
 */
export type SyncKey = string;

export type SaveActivity =
  | { status: 'saving'; requestId: number }
  | { status: 'failed'; requestId: number; error: unknown };

export type SyncActivity = {
  save?: SaveActivity;
  /** The request id of a delete in flight. */
  deleting?: number;
  /** Image uploads in flight; several can run at once. */
  uploads?: number;
};

export type SyncActivityState = Readonly<Record<SyncKey, SyncActivity>>;

export type SyncActivityEvent =
  | { type: 'save_started'; key: SyncKey; requestId: number }
  | { type: 'save_succeeded'; key: SyncKey; requestId: number }
  | { type: 'save_failed'; key: SyncKey; requestId: number; error: unknown }
  /** The person resolved a failed save another way, such as reloading or saving a copy. */
  | { type: 'save_failure_cleared'; key: SyncKey }
  | { type: 'delete_started'; key: SyncKey; requestId: number }
  | { type: 'delete_settled'; key: SyncKey; requestId: number }
  | { type: 'upload_started'; key: SyncKey }
  | { type: 'upload_settled'; key: SyncKey };

export const EMPTY_SYNC_ACTIVITY: SyncActivityState = {};

export function noteSyncKey(identity: NoteIdentity): SyncKey {
  return `note:${getNoteIdentityKey(identity)}`;
}

export function draftSyncKey(tabId: string): SyncKey {
  return `draft:${tabId}`;
}

/** The key a tab's progress is kept under, or null for a blank tab. */
export function tabSyncKey(tab: OpenNoteTab): SyncKey | null {
  if (isBlankNoteTab(tab)) return null;
  if (isDraftNoteTab(tab)) return draftSyncKey(tab.tabId);
  const identity = getSavedTabNoteIdentity(tab);
  return identity ? noteSyncKey(identity) : null;
}

/**
 * Keys whose last tab closed between two snapshots of the same workspace. A failed save there is
 * over: its edits were discarded or saved some other way, so it must not mark the note later.
 */
export function closedSyncKeys(previous: Record<string, OpenNoteTab>, next: Record<string, OpenNoteTab>): SyncKey[] {
  const open = new Set(Object.values(next).map(tabSyncKey));
  const closed = new Set<SyncKey>();
  for (const tab of Object.values(previous)) {
    if (next[tab.tabId]) continue;
    const key = tabSyncKey(tab);
    if (key && !open.has(key)) closed.add(key);
  }
  return [...closed];
}

function nextActivity(current: SyncActivity, event: SyncActivityEvent): SyncActivity {
  switch (event.type) {
    case 'save_started':
      // A new save replaces an earlier failure, and supersedes an earlier save still in flight.
      return { ...current, save: { status: 'saving', requestId: event.requestId } };
    case 'save_succeeded':
      return current.save?.status === 'saving' && current.save.requestId === event.requestId
        ? { ...current, save: undefined }
        : current;
    case 'save_failed':
      return current.save?.status === 'saving' && current.save.requestId === event.requestId
        ? { ...current, save: { status: 'failed', requestId: event.requestId, error: event.error } }
        : current;
    case 'save_failure_cleared':
      return current.save?.status === 'failed' ? { ...current, save: undefined } : current;
    case 'delete_started':
      return { ...current, deleting: event.requestId };
    case 'delete_settled':
      return current.deleting === event.requestId ? { ...current, deleting: undefined } : current;
    case 'upload_started':
      return { ...current, uploads: (current.uploads ?? 0) + 1 };
    case 'upload_settled':
      return current.uploads ? { ...current, uploads: current.uploads - 1 || undefined } : current;
  }
}

function isIdle(activity: SyncActivity) {
  return !activity.save && activity.deleting === undefined && !activity.uploads;
}

export function syncActivityReducer(state: SyncActivityState, event: SyncActivityEvent): SyncActivityState {
  const current = state[event.key] ?? {};
  const next = nextActivity(current, event);
  if (next === current) return state;
  if (isIdle(next)) {
    if (!(event.key in state)) return state;
    const rest = { ...state };
    delete rest[event.key];
    return rest;
  }
  return { ...state, [event.key]: next };
}

export function isSyncSaving(state: SyncActivityState, key: SyncKey) {
  return state[key]?.save?.status === 'saving';
}

/** The error of the latest save when it failed, or null. */
export function getSyncSaveFailure(state: SyncActivityState, key: SyncKey): { error: unknown } | null {
  const save = state[key]?.save;
  return save?.status === 'failed' ? { error: save.error } : null;
}

export function isSyncDeleting(state: SyncActivityState, key: SyncKey) {
  return state[key]?.deleting !== undefined;
}

export function isSyncUploading(state: SyncActivityState, key: SyncKey) {
  return Boolean(state[key]?.uploads);
}
