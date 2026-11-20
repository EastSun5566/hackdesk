import { afterEach, describe, expect, it } from 'vitest';

import { readHistoryDismissals, removeFromHistory, restoreToHistory, withoutDismissedHistory } from './history-dismissals';

describe('history dismissals', () => {
  afterEach(() => window.localStorage.clear());

  it('hides removed notes per account until they are opened again', () => {
    removeFromHistory('acct-a', 'note-1');
    const notes = [{ id: 'note-1' }, { id: 'note-2' }];
    expect(withoutDismissedHistory(notes, readHistoryDismissals('acct-a'))).toEqual([{ id: 'note-2' }]);
    expect(withoutDismissedHistory(notes, readHistoryDismissals('acct-b'))).toBe(notes);

    restoreToHistory('acct-a', 'note-1');
    expect(readHistoryDismissals('acct-a').has('note-1')).toBe(false);
  });

  it('ignores a damaged list', () => {
    window.localStorage.setItem('hackdesk_history_dismissed:acct-a', '{broken');
    expect(readHistoryDismissals('acct-a').size).toBe(0);
  });
});
