import { describe, expect, it } from 'vitest';

import type { DraftOpenNoteTab, OpenNoteTab, SavedOpenNoteTab } from './note-workspace';
import {
  closedSyncKeys,
  draftSyncKey,
  getSyncSaveFailure,
  isSyncDeleting,
  isSyncSaving,
  isSyncUploading,
  noteSyncKey,
  syncActivityReducer,
  type SyncActivityEvent,
  type SyncActivityState,
} from './note-sync-activity';

const a = noteSyncKey({ id: 'note-a', teamPath: null });
const b = noteSyncKey({ id: 'note-b', teamPath: null });
const failure = new Error('Simulated failure');

const started = (key: string, requestId: number): SyncActivityEvent => ({ type: 'save_started', key, requestId });
const succeeded = (key: string, requestId: number): SyncActivityEvent => ({ type: 'save_succeeded', key, requestId });
const failed = (key: string, requestId: number): SyncActivityEvent => ({ type: 'save_failed', key, requestId, error: failure });

const run = (events: SyncActivityEvent[]) => events.reduce<SyncActivityState>(syncActivityReducer, {});

function saveStatus(state: SyncActivityState, key: string) {
  if (isSyncSaving(state, key)) return 'saving';
  return getSyncSaveFailure(state, key) ? 'failed' : 'none';
}

describe('syncActivityReducer', () => {
  it.each([
    ['a save in flight', [started(a, 1)], a, 'saving'],
    ['a save that succeeded', [started(a, 1), succeeded(a, 1)], a, 'none'],
    ['a save that failed', [started(a, 1), failed(a, 1)], a, 'failed'],
    ['another note saving keeps a failure', [started(a, 1), failed(a, 1), started(b, 2)], a, 'failed'],
    ['another note succeeding keeps a failure', [started(a, 1), failed(a, 1), started(b, 2), succeeded(b, 2)], a, 'failed'],
    ['another note saving keeps a save in flight', [started(a, 1), started(b, 2), succeeded(b, 2)], a, 'saving'],
    ['a retry replaces the failure', [started(a, 1), failed(a, 1), started(a, 2)], a, 'saving'],
    ['a late success of a superseded save is ignored', [started(a, 1), started(a, 2), succeeded(a, 1)], a, 'saving'],
    ['a late failure of a superseded save is ignored', [started(a, 1), started(a, 2), succeeded(a, 2), failed(a, 1)], a, 'none'],
    ['clearing removes a failure', [started(a, 1), failed(a, 1), { type: 'save_failure_cleared', key: a }], a, 'none'],
    ['clearing leaves a save in flight', [started(a, 1), { type: 'save_failure_cleared', key: a }], a, 'saving'],
  ] as const)('%s', (_name, events, key, expected) => {
    expect(saveStatus(run([...events]), key)).toBe(expected);
  });

  it('keeps the failure error for recovery messages', () => {
    expect(getSyncSaveFailure(run([started(a, 1), failed(a, 1)]), a)).toEqual({ error: failure });
  });

  it('tracks deletes by request and uploads by count', () => {
    let state = run([{ type: 'delete_started', key: a, requestId: 1 }]);
    expect(isSyncDeleting(state, a)).toBe(true);
    state = syncActivityReducer(state, { type: 'delete_settled', key: a, requestId: 0 });
    expect(isSyncDeleting(state, a)).toBe(true);
    state = syncActivityReducer(state, { type: 'delete_settled', key: a, requestId: 1 });
    expect(isSyncDeleting(state, a)).toBe(false);

    state = run([{ type: 'upload_started', key: a }, { type: 'upload_started', key: a }, { type: 'upload_settled', key: a }]);
    expect(isSyncUploading(state, a)).toBe(true);
    state = syncActivityReducer(state, { type: 'upload_settled', key: a });
    expect(isSyncUploading(state, a)).toBe(false);
  });

  it('keeps drafts apart from saved notes and drops keys with nothing left', () => {
    const draft = draftSyncKey('tab-1');
    const state = run([started(draft, 1), failed(draft, 1)]);
    expect(getSyncSaveFailure(state, draft)).not.toBeNull();
    expect(saveStatus(state, a)).toBe('none');
    expect(run([started(a, 1), succeeded(a, 1)])).toEqual({});
  });

  it('returns the same state when an event changes nothing', () => {
    const state = run([started(a, 1)]);
    expect(syncActivityReducer(state, succeeded(a, 99))).toBe(state);
    expect(syncActivityReducer(state, { type: 'upload_settled', key: b })).toBe(state);
  });
});

describe('closedSyncKeys', () => {
  const saved = (tabId: string, noteId: string): SavedOpenNoteTab => ({
    tabId, noteId, teamPath: null, title: noteId, shortId: null, updatedAtMillis: null,
  });
  const draft = (tabId: string): DraftOpenNoteTab => ({
    kind: 'draft', tabId, draftId: `draft-${tabId}`, title: 'Untitled', shortId: null, updatedAtMillis: null,
  });
  const tabs = (...list: OpenNoteTab[]) => Object.fromEntries(list.map((tab) => [tab.tabId, tab]));

  it('reports a note or draft once its last tab closes', () => {
    const before = tabs(saved('t1', 'note-a'), saved('t2', 'note-b'), draft('t3'));
    expect(closedSyncKeys(before, tabs(saved('t2', 'note-b')))).toEqual([a, draftSyncKey('t3')]);
  });

  it('keeps a note that another tab still shows', () => {
    const before = tabs(saved('t1', 'note-a'), saved('t2', 'note-a'));
    expect(closedSyncKeys(before, tabs(saved('t2', 'note-a')))).toEqual([]);
  });
});
